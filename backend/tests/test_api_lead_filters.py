"""
API tests for lead filtering, sorting, and run progress (issue #0008).

Covers:
- GET /leads/run/{id}?signal_types=  — filter by gap signal type (multi)
- GET /leads/run/{id}?statuses=      — filter by lead status (multi)
- GET /leads/run/{id}?sort=          — sort by gap_score|name|city
- GET /runs/{id}/progress            — returns queries_completed/queries_total/leads_found
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.main import app
from app.database import get_db
from app.models import Base, Run, Lead, GapSignal, RunStatus


# ---------------------------------------------------------------------------
# Database isolation fixture (shared pattern across test suite)
# ---------------------------------------------------------------------------

@pytest.fixture
def test_db():
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

def _seed_run_with_leads(test_db) -> int:
    """
    Creates one Run with three leads having varied signal types, statuses,
    gap scores, names, and cities.  Returns the run_id.

    Lead layout:
      lead 1: gap_score=9.0, name="Ace Plumber",   city="Austin",  status="new",       signal="no_website"
      lead 2: gap_score=6.0, name="Beta Roofing",  city="Boston",  status="reviewing", signal="missing_meta_title"
      lead 3: gap_score=20.0, name="Cedar HVAC",    city="Chicago", status="contacted", signal="no_website" + "few_google_reviews"
    """
    db = test_db()
    try:
        run = Run(config_yaml="queries:\n  - test\n", status=RunStatus.completed.value, total_leads=3)
        db.add(run)
        db.flush()

        leads_data = [
            dict(external_id="p1", name="Ace Plumber",  city="Austin",  state="TX", gap_score=9.0,  status="new",       signals=[("no_website", True)]),
            dict(external_id="p2", name="Beta Roofing", city="Boston",  state="MA", gap_score=6.0,  status="reviewing", signals=[("missing_meta_title", False)]),
            dict(external_id="p3", name="Cedar HVAC",   city="Chicago", state="IL", gap_score=20.0, status="contacted", signals=[("no_website", True), ("few_google_reviews", True)]),
        ]

        for ld in leads_data:
            lead = Lead(
                run_id=run.id,
                external_id=ld["external_id"],
                name=ld["name"],
                city=ld["city"],
                state=ld["state"],
                gap_score=ld["gap_score"],
                status=ld["status"],
            )
            db.add(lead)
            db.flush()
            for sig_type, is_hard in ld["signals"]:
                db.add(GapSignal(
                    lead_id=lead.id,
                    signal_type=sig_type,
                    is_hard=is_hard,
                    description=f"{sig_type} description",
                ))

        db.commit()
        return run.id
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Filtering by signal_type
# ---------------------------------------------------------------------------

class TestFilterBySignalType:
    def test_filter_single_signal_type(self, client, test_db):
        """?signal_types=no_website returns only leads that have that signal."""
        run_id = _seed_run_with_leads(test_db)

        resp = client.get(f"/api/leads/run/{run_id}?signal_types=no_website")
        assert resp.status_code == 200
        data = resp.json()

        names = [d["name"] for d in data]
        assert "Ace Plumber" in names
        assert "Cedar HVAC" in names
        assert "Beta Roofing" not in names

    def test_filter_multiple_signal_types_union(self, client, test_db):
        """?signal_types=no_website&signal_types=missing_meta_title returns leads with EITHER signal."""
        run_id = _seed_run_with_leads(test_db)

        resp = client.get(f"/api/leads/run/{run_id}?signal_types=no_website&signal_types=missing_meta_title")
        assert resp.status_code == 200
        data = resp.json()

        names = [d["name"] for d in data]
        assert "Ace Plumber" in names
        assert "Beta Roofing" in names
        assert "Cedar HVAC" in names

    def test_no_signal_type_filter_returns_all(self, client, test_db):
        """Without ?signal_types= all leads are returned."""
        run_id = _seed_run_with_leads(test_db)

        resp = client.get(f"/api/leads/run/{run_id}")
        assert resp.status_code == 200
        assert len(resp.json()) == 3

    def test_unknown_signal_type_returns_empty(self, client, test_db):
        """An unrecognised signal type returns an empty list (no match)."""
        run_id = _seed_run_with_leads(test_db)

        resp = client.get(f"/api/leads/run/{run_id}?signal_types=nonexistent_signal")
        assert resp.status_code == 200
        assert resp.json() == []


# ---------------------------------------------------------------------------
# Filtering by status
# ---------------------------------------------------------------------------

class TestFilterByStatus:
    def test_filter_single_status(self, client, test_db):
        """?statuses=new returns only leads with status=new."""
        run_id = _seed_run_with_leads(test_db)

        resp = client.get(f"/api/leads/run/{run_id}?statuses=new")
        assert resp.status_code == 200
        data = resp.json()

        assert len(data) == 1
        assert data[0]["name"] == "Ace Plumber"

    def test_filter_multiple_statuses(self, client, test_db):
        """?statuses=new&statuses=reviewing returns leads with either status."""
        run_id = _seed_run_with_leads(test_db)

        resp = client.get(f"/api/leads/run/{run_id}?statuses=new&statuses=reviewing")
        assert resp.status_code == 200
        data = resp.json()

        names = [d["name"] for d in data]
        assert "Ace Plumber" in names
        assert "Beta Roofing" in names
        assert "Cedar HVAC" not in names

    def test_invalid_status_returns_422(self, client, test_db):
        """?statuses=bogus should return 422 Unprocessable Entity."""
        run_id = _seed_run_with_leads(test_db)

        resp = client.get(f"/api/leads/run/{run_id}?statuses=bogus")
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Sorting
# ---------------------------------------------------------------------------

class TestSorting:
    def test_default_sort_is_gap_score_desc(self, client, test_db):
        """Without ?sort= leads come back highest gap_score first."""
        run_id = _seed_run_with_leads(test_db)

        resp = client.get(f"/api/leads/run/{run_id}")
        assert resp.status_code == 200
        scores = [d["gap_score"] for d in resp.json()]
        assert scores == sorted(scores, reverse=True)

    def test_sort_by_name_asc(self, client, test_db):
        """?sort=name returns leads alphabetically by name."""
        run_id = _seed_run_with_leads(test_db)

        resp = client.get(f"/api/leads/run/{run_id}?sort=name")
        assert resp.status_code == 200
        names = [d["name"] for d in resp.json()]
        assert names == sorted(names)

    def test_sort_by_city_asc(self, client, test_db):
        """?sort=city returns leads alphabetically by city."""
        run_id = _seed_run_with_leads(test_db)

        resp = client.get(f"/api/leads/run/{run_id}?sort=city")
        assert resp.status_code == 200
        cities = [d["city"] for d in resp.json()]
        assert cities == sorted(cities)

    def test_sort_by_gap_score_explicit(self, client, test_db):
        """?sort=gap_score is accepted and returns highest first."""
        run_id = _seed_run_with_leads(test_db)

        resp = client.get(f"/api/leads/run/{run_id}?sort=gap_score")
        assert resp.status_code == 200
        scores = [d["gap_score"] for d in resp.json()]
        assert scores == sorted(scores, reverse=True)

    def test_invalid_sort_returns_422(self, client, test_db):
        """?sort=unknown should return 422."""
        run_id = _seed_run_with_leads(test_db)

        resp = client.get(f"/api/leads/run/{run_id}?sort=unknown")
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Combined filter + sort
# ---------------------------------------------------------------------------

class TestCombinedFilterSort:
    def test_filter_and_sort_combined(self, client, test_db):
        """signal_types + sort can be combined."""
        run_id = _seed_run_with_leads(test_db)

        resp = client.get(f"/api/leads/run/{run_id}?signal_types=no_website&sort=name")
        assert resp.status_code == 200
        data = resp.json()
        names = [d["name"] for d in data]
        # Only leads with no_website, sorted by name
        assert names == sorted(names)
        assert "Beta Roofing" not in names


# ---------------------------------------------------------------------------
# Run progress endpoint
# ---------------------------------------------------------------------------

class TestRunProgress:
    def test_progress_endpoint_exists_for_valid_run(self, client, test_db):
        """GET /runs/{id}/progress returns 200 for an existing run."""
        db = test_db()
        try:
            run = Run(config_yaml="queries:\n  - test\n", status=RunStatus.running.value, total_leads=0)
            db.add(run)
            db.commit()
            run_id = run.id
        finally:
            db.close()

        resp = client.get(f"/api/runs/{run_id}/progress")
        assert resp.status_code == 200

    def test_progress_returns_required_fields(self, client, test_db):
        """Progress response contains queries_completed, queries_total, leads_found."""
        db = test_db()
        try:
            run = Run(
                config_yaml="queries:\n  - test\n",
                status=RunStatus.running.value,
                total_leads=5,
                queries_completed=3,
                queries_total=10,
            )
            db.add(run)
            db.commit()
            run_id = run.id
        finally:
            db.close()

        resp = client.get(f"/api/runs/{run_id}/progress")
        assert resp.status_code == 200
        data = resp.json()
        assert data["queries_completed"] == 3
        assert data["queries_total"] == 10
        assert data["leads_found"] == 5
        assert data["status"] == RunStatus.running.value

    def test_progress_returns_404_for_missing_run(self, client, test_db):
        """GET /runs/9999/progress returns 404 when run doesn't exist."""
        resp = client.get("/api/runs/9999/progress")
        assert resp.status_code == 404
