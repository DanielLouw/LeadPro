"""
API tests for the consolidated all-runs lead listing.

Covers GET /leads/ :
- returns leads from ALL runs
- ?signal_types=  — filter by gap signal type (multi)
- ?statuses=      — filter by lead status (multi)
- ?states=        — filter by lead state (multi)
- ?search=        — case-insensitive name substring
- ?sort=          — gap_score (default) | name | city | state
- invalid sort / status values are rejected with 422
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

def _seed_two_runs(test_db) -> tuple[int, int]:
    """
    Two runs, four leads total:

    Run A:
      lead 1: gap_score=9.0,  name="Ace Plumber",   city="Austin",  state="TX", status="new",       signal="no_website"
      lead 2: gap_score=6.0,  name="Beta Roofing",  city="Boston",  state="MA", status="reviewing", signal="missing_meta_title"
    Run B:
      lead 3: gap_score=20.0, name="Cedar HVAC",    city="Chicago", state="IL", status="contacted", signals="no_website","few_google_reviews"
      lead 4: gap_score=3.0,  name="Delta Dental",  city="Dallas",  state="TX", status="pass",      signal="missing_meta_title"
    """
    db = test_db()
    try:
        run_a = Run(config_yaml="queries:\n  - a\n", status=RunStatus.completed.value, total_leads=2)
        run_b = Run(config_yaml="queries:\n  - b\n", status=RunStatus.completed.value, total_leads=2)
        db.add_all([run_a, run_b])
        db.flush()

        leads_data = [
            dict(run_id=run_a.id, external_id="p1", name="Ace Plumber",  city="Austin",  state="TX", gap_score=9.0,  status="new",       signals=[("no_website", True)]),
            dict(run_id=run_a.id, external_id="p2", name="Beta Roofing", city="Boston",  state="MA", gap_score=6.0,  status="reviewing", signals=[("missing_meta_title", False)]),
            dict(run_id=run_b.id, external_id="p3", name="Cedar HVAC",   city="Chicago", state="IL", gap_score=20.0, status="contacted", signals=[("no_website", True), ("few_google_reviews", True)]),
            dict(run_id=run_b.id, external_id="p4", name="Delta Dental", city="Dallas",  state="TX", gap_score=3.0,  status="pass",      signals=[("missing_meta_title", False)]),
        ]

        for ld in leads_data:
            lead = Lead(
                run_id=ld["run_id"],
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
        return run_a.id, run_b.id
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Cross-run listing
# ---------------------------------------------------------------------------

class TestAllLeadsListing:
    def test_returns_leads_from_all_runs(self, client, test_db):
        run_a, run_b = _seed_two_runs(test_db)

        resp = client.get("/api/leads/")
        assert resp.status_code == 200
        body = resp.json()
        assert len(body) == 4
        assert {lead["run_id"] for lead in body} == {run_a, run_b}

    def test_default_sort_is_gap_score_desc(self, client, test_db):
        _seed_two_runs(test_db)

        resp = client.get("/api/leads/")
        scores = [lead["gap_score"] for lead in resp.json()]
        assert scores == sorted(scores, reverse=True)

    def test_empty_db_returns_empty_list(self, client, test_db):
        resp = client.get("/api/leads/")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_includes_gap_signals_and_note(self, client, test_db):
        _seed_two_runs(test_db)

        resp = client.get("/api/leads/")
        cedar = next(l for l in resp.json() if l["name"] == "Cedar HVAC")
        assert {s["signal_type"] for s in cedar["gap_signals"]} == {"no_website", "few_google_reviews"}
        assert "note" in cedar


# ---------------------------------------------------------------------------
# Filters
# ---------------------------------------------------------------------------

class TestAllLeadsFilters:
    def test_filter_by_signal_type(self, client, test_db):
        _seed_two_runs(test_db)

        resp = client.get("/api/leads/?signal_types=no_website")
        names = {l["name"] for l in resp.json()}
        assert names == {"Ace Plumber", "Cedar HVAC"}

    def test_filter_by_status_multi(self, client, test_db):
        _seed_two_runs(test_db)

        resp = client.get("/api/leads/?statuses=new&statuses=pass")
        names = {l["name"] for l in resp.json()}
        assert names == {"Ace Plumber", "Delta Dental"}

    def test_filter_by_state(self, client, test_db):
        _seed_two_runs(test_db)

        resp = client.get("/api/leads/?states=TX")
        names = {l["name"] for l in resp.json()}
        assert names == {"Ace Plumber", "Delta Dental"}

    def test_filter_by_state_multi(self, client, test_db):
        _seed_two_runs(test_db)

        resp = client.get("/api/leads/?states=TX&states=IL")
        names = {l["name"] for l in resp.json()}
        assert names == {"Ace Plumber", "Delta Dental", "Cedar HVAC"}

    def test_search_name_substring_case_insensitive(self, client, test_db):
        _seed_two_runs(test_db)

        resp = client.get("/api/leads/?search=plumb")
        names = {l["name"] for l in resp.json()}
        assert names == {"Ace Plumber"}

    def test_combined_filters(self, client, test_db):
        _seed_two_runs(test_db)

        resp = client.get("/api/leads/?states=TX&statuses=new")
        names = {l["name"] for l in resp.json()}
        assert names == {"Ace Plumber"}

    def test_invalid_status_rejected(self, client, test_db):
        _seed_two_runs(test_db)

        resp = client.get("/api/leads/?statuses=bogus")
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Sorting
# ---------------------------------------------------------------------------

class TestAllLeadsSorting:
    def test_sort_by_name(self, client, test_db):
        _seed_two_runs(test_db)

        resp = client.get("/api/leads/?sort=name")
        names = [l["name"] for l in resp.json()]
        assert names == sorted(names)

    def test_sort_by_state(self, client, test_db):
        _seed_two_runs(test_db)

        resp = client.get("/api/leads/?sort=state")
        states = [l["state"] for l in resp.json()]
        assert states == sorted(states)

    def test_invalid_sort_rejected(self, client, test_db):
        _seed_two_runs(test_db)

        resp = client.get("/api/leads/?sort=bogus")
        assert resp.status_code == 422
