"""
API tests for POST /runs (issue #0004).

Uses FastAPI TestClient with all external calls mocked.
Database is an isolated in-memory SQLite instance per test.
"""

import pytest
from unittest.mock import patch, AsyncMock

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.main import app
from app.budget import estimate_run_cost
from app.database import get_db
from app.models import Base, Run, Lead, GapSignal, RunStatus, SearchSlot


# ---------------------------------------------------------------------------
# Database isolation fixture
# ---------------------------------------------------------------------------

@pytest.fixture
def test_db():
    # StaticPool ensures all connections share the same in-memory database.
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestingSession = sessionmaker(bind=engine, autocommit=False, autoflush=False)

    def override_get_db():
        db = TestingSession()
        try:
            yield db
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    yield TestingSession
    app.dependency_overrides.pop(get_db, None)
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client(test_db):
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

SAMPLE_CONFIG = "queries:\n  - plumbers in Austin TX\nmax_results_per_run: 10\n"


# ---------------------------------------------------------------------------
# POST /runs — basic creation
# ---------------------------------------------------------------------------

def test_post_runs_returns_201_with_run_id(client, test_db):
    """POST /runs creates a run and returns id + pending status."""
    with patch("app.api.routes.runs._run_pipeline", new_callable=AsyncMock):
        resp = client.post("/api/runs/", json={"config_yaml": SAMPLE_CONFIG})

    assert resp.status_code == 201
    data = resp.json()
    assert "id" in data
    assert isinstance(data["id"], int)
    assert data["status"] == "pending"
    assert data["total_leads"] == 0


def test_post_runs_persists_run_to_db(client, test_db):
    """POST /runs persists the run to the database."""
    with patch("app.api.routes.runs._run_pipeline", new_callable=AsyncMock):
        resp = client.post("/api/runs/", json={"config_yaml": SAMPLE_CONFIG})

    run_id = resp.json()["id"]
    db = test_db()
    try:
        run = db.get(Run, run_id)
        assert run is not None
        assert run.config_yaml == SAMPLE_CONFIG
    finally:
        db.close()


def test_post_runs_triggers_pipeline(client, test_db):
    """POST /runs schedules the pipeline as a background task."""
    with patch("app.api.routes.runs._run_pipeline", new_callable=AsyncMock) as mock_pipeline:
        client.post("/api/runs/", json={"config_yaml": SAMPLE_CONFIG})
    # Background tasks run synchronously in TestClient
    mock_pipeline.assert_called_once()


# ---------------------------------------------------------------------------
# Pipeline integration: POST /runs with mocked pipeline execution
# ---------------------------------------------------------------------------

def test_post_runs_full_pipeline_mocked(client, test_db):
    """
    POST /runs with a mocked pipeline that writes leads directly:
    verify GET /leads/run/{id} returns those leads.
    """
    biz_place_id = "place_x"
    biz_name = "Pipeline Plumber"

    async def mock_pipeline(run_id: int) -> None:
        db = test_db()
        try:
            run = db.get(Run, run_id)
            run.status = RunStatus.completed.value
            lead = Lead(
                run_id=run_id,
                external_id=biz_place_id,
                name=biz_name,
                phone="(512) 555-9999",
                address="5 Pine St, Austin, TX 78701, USA",
                city="Austin",
                state="TX",
                website_url=None,
                maps_url="https://maps/x",
                gap_score=10.0,
                status="new",
            )
            db.add(lead)
            db.flush()
            db.add(GapSignal(
                lead_id=lead.id,
                signal_type="no_website",
                is_hard=True,
                description="No website listed",
            ))
            run.total_leads = 1
            db.commit()
        finally:
            db.close()

    with patch("app.api.routes.runs._run_pipeline", side_effect=mock_pipeline):
        post_resp = client.post("/api/runs/", json={"config_yaml": SAMPLE_CONFIG})

    assert post_resp.status_code == 201
    run_id = post_resp.json()["id"]

    get_resp = client.get(f"/api/leads/run/{run_id}")
    assert get_resp.status_code == 200
    leads = get_resp.json()
    assert len(leads) == 1
    assert leads[0]["name"] == biz_name
    assert leads[0]["gap_score"] == 10.0
    assert leads[0]["gap_signals"][0]["signal_type"] == "no_website"


# ---------------------------------------------------------------------------
# POST /runs/estimate — cost estimate (issue #0006)
# ---------------------------------------------------------------------------

def test_estimate_returns_cost_breakdown(client):
    """
    POST /runs/estimate with a config YAML returns:
      - query_count: number of queries in the config
      - estimated_results: min(query_count * results_per_request, max_results_per_run)
      - estimated_cost_usd: a positive float
    """
    config = "queries:\n  - plumbers in Austin TX\n  - hvac in Dallas TX\nmax_results_per_run: 100\n"
    resp = client.post("/api/runs/estimate", json={"config_yaml": config})
    assert resp.status_code == 200
    data = resp.json()

    assert data["query_count"] == 2
    assert isinstance(data["estimated_results"], int)
    assert data["estimated_results"] > 0
    assert data["estimated_results"] <= 100          # never exceeds cap
    assert isinstance(data["estimated_cost_usd"], float)
    assert data["estimated_cost_usd"] > 0


def test_estimate_respects_max_results_cap(client):
    """
    When query_count * results_per_page would exceed max_results_per_run,
    estimated_results is clamped to max_results_per_run.
    """
    # 5 queries × 20 results = 100 potential results, but cap is 30
    queries = "\n".join(f"  - query {i}" for i in range(5))
    config = f"queries:\n{queries}\nmax_results_per_run: 30\n"
    resp = client.post("/api/runs/estimate", json={"config_yaml": config})
    assert resp.status_code == 200
    data = resp.json()
    assert data["estimated_results"] == 30


def test_estimate_returns_400_for_missing_queries(client):
    """POST /runs/estimate with YAML that has no queries returns 400."""
    config = "max_results_per_run: 500\n"
    resp = client.post("/api/runs/estimate", json={"config_yaml": config})
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# POST /runs/estimate — cycling config shape (issue #0018)
# ---------------------------------------------------------------------------

def test_estimate_cycling_config_returns_correct_values(client):
    """
    POST /runs/estimate with cycling config (industry + state + slots_per_run)
    returns query_count == slots_per_run and estimated_results == slots_per_run * max_results_per_run.
    """
    config = (
        "source: google_places\n"
        "source_config:\n"
        "  industry: plumbers\n"
        "  state: TX\n"
        "  slots_per_run: 5\n"
        "max_results_per_run: 20\n"
    )
    resp = client.post("/api/runs/estimate", json={"config_yaml": config})
    assert resp.status_code == 200
    data = resp.json()

    assert data["query_count"] == 5
    assert data["estimated_results"] == 5 * 20  # slots_per_run * max_results_per_run
    assert isinstance(data["estimated_cost_usd"], float)
    assert data["estimated_cost_usd"] > 0


def test_estimate_cycling_config_defaults_slots_per_run_to_3(client):
    """
    POST /runs/estimate with cycling config omitting slots_per_run defaults to 3.
    """
    config = (
        "source: google_places\n"
        "source_config:\n"
        "  industry: plumbers\n"
        "  state: TX\n"
        "max_results_per_run: 20\n"
    )
    resp = client.post("/api/runs/estimate", json={"config_yaml": config})
    assert resp.status_code == 200
    data = resp.json()

    assert data["query_count"] == 3  # default slots_per_run
    assert data["estimated_results"] == 3 * 20


def test_estimate_cycling_config_missing_industry_returns_400(client):
    """POST /runs/estimate with cycling config missing industry returns 400 from the cycling branch."""
    config = (
        "source: google_places\n"
        "source_config:\n"
        "  state: TX\n"
        "  slots_per_run: 3\n"
        "max_results_per_run: 20\n"
    )
    resp = client.post("/api/runs/estimate", json={"config_yaml": config})
    assert resp.status_code == 400
    assert "industry" in resp.json()["detail"]


def test_estimate_cycling_config_missing_state_returns_400(client):
    """POST /runs/estimate with cycling config missing state returns 400 from the cycling branch."""
    config = (
        "source: google_places\n"
        "source_config:\n"
        "  industry: plumbers\n"
        "  slots_per_run: 3\n"
        "max_results_per_run: 20\n"
    )
    resp = client.post("/api/runs/estimate", json={"config_yaml": config})
    assert resp.status_code == 400
    assert "state" in resp.json()["detail"]


def test_estimate_cycling_config_cost_matches_estimate_run_cost(client):
    """
    The estimated_cost_usd for cycling config equals
    estimate_run_cost('google_places', slots_per_run * max_results_per_run).
    """
    slots = 4
    max_results = 20
    config = (
        f"source: google_places\n"
        f"source_config:\n"
        f"  industry: plumbers\n"
        f"  state: TX\n"
        f"  slots_per_run: {slots}\n"
        f"max_results_per_run: {max_results}\n"
    )
    resp = client.post("/api/runs/estimate", json={"config_yaml": config})
    assert resp.status_code == 200
    data = resp.json()

    expected_cost = estimate_run_cost("google_places", slots * max_results)
    assert data["estimated_cost_usd"] == pytest.approx(expected_cost)


def test_estimate_cycling_config_invalid_slots_per_run_returns_400(client):
    """POST /runs/estimate with a non-positive slots_per_run returns 400."""
    config = (
        "source: google_places\n"
        "source_config:\n"
        "  industry: plumbers\n"
        "  state: TX\n"
        "  slots_per_run: 0\n"
        "max_results_per_run: 20\n"
    )
    resp = client.post("/api/runs/estimate", json={"config_yaml": config})
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# GET /runs/county-coverage
# ---------------------------------------------------------------------------

def test_county_coverage_no_slots_returns_total_and_zero_searched(client):
    """Fresh state with no search_slots returns correct total counties and 0 searched."""
    resp = client.get("/api/runs/county-coverage?state=TX")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_counties"] == 254
    assert data["searched_counties"] == 0


def test_county_coverage_unsearched_slots_not_counted(client, test_db):
    """Slots with search_count=0 do not contribute to searched_counties."""
    db = test_db()
    try:
        db.add(SearchSlot(state="TX", county="Travis County", industry="plumbers", search_term="plumbers in Travis County TX", search_count=0))
        db.commit()
    finally:
        db.close()

    resp = client.get("/api/runs/county-coverage?state=TX")
    assert resp.status_code == 200
    assert resp.json()["searched_counties"] == 0


def test_county_coverage_same_county_multiple_industries_counts_once(client, test_db):
    """A county searched under two different industries counts as 1 searched county."""
    db = test_db()
    try:
        db.add(SearchSlot(state="TX", county="Travis County", industry="plumbers", search_term="plumbers in Travis County TX", search_count=1))
        db.add(SearchSlot(state="TX", county="Travis County", industry="electricians", search_term="electricians in Travis County TX", search_count=2))
        db.commit()
    finally:
        db.close()

    resp = client.get("/api/runs/county-coverage?state=TX")
    assert resp.status_code == 200
    assert resp.json()["searched_counties"] == 1


def test_county_coverage_unknown_state_returns_zeros(client):
    """A state code not in the COUNTIES dict returns total_counties=0, searched_counties=0."""
    resp = client.get("/api/runs/county-coverage?state=ZZ")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_counties"] == 0
    assert data["searched_counties"] == 0


def test_county_coverage_lowercase_state_code_accepted(client):
    """Lowercase state code is treated the same as uppercase."""
    resp = client.get("/api/runs/county-coverage?state=tx")
    assert resp.status_code == 200
    assert resp.json()["total_counties"] == 254
