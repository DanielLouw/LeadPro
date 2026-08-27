"""
API tests for GET /leads/run/{run_id}/export/csv (backend/app/api/routes/leads.py).

This endpoint previously had no test coverage at all. Uses FastAPI TestClient
with an isolated in-memory SQLite instance per test, matching the conventions
in test_api_leads_export.py and test_api_all_leads_export.py.
"""

import csv
import io

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.main import app
from app.database import get_db
from app.models import Base, GapSignal, Lead, Note, Run


# ---------------------------------------------------------------------------
# Database isolation fixture
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
    """Create a completed run with two leads (one with a website, one without)."""
    db = test_db()
    try:
        run = Run(config_yaml="queries:\n  - test\n", status="completed", total_leads=2)
        db.add(run)
        db.flush()

        lead1 = Lead(
            run_id=run.id,
            external_id="place_001",
            name="Alpha Plumber",
            phone="(512) 555-0001",
            address="1 Main St",
            city="Austin",
            state="TX",
            email="alpha@example.com",
            website_url=None,
            maps_url="https://maps/alpha",
            gap_score=10.0,
            status="new",
        )
        lead2 = Lead(
            run_id=run.id,
            external_id="place_002",
            name="Beta Plumber",
            phone=None,
            address=None,
            city="Dallas",
            state="TX",
            email=None,
            website_url="https://beta.example.com",
            maps_url="https://maps/beta",
            gap_score=4.0,
            status="reviewing",
        )
        db.add_all([lead1, lead2])
        db.flush()
        db.add(GapSignal(lead_id=lead1.id, signal_type="no_website", is_hard=True, description="No website listed"))
        db.add(Note(lead_id=lead1.id, content="Follow up Monday"))

        db.commit()
        return run.id
    finally:
        db.close()


def _parse_csv(content: str) -> list[dict]:
    reader = csv.DictReader(io.StringIO(content))
    return list(reader)


# ---------------------------------------------------------------------------
# Tracer bullet: endpoint exists and returns CSV
# ---------------------------------------------------------------------------


def test_export_returns_csv_content_type(client, test_db):
    """GET /leads/run/{run_id}/export/csv returns Content-Type: text/csv."""
    run_id = _seed_run_with_leads(test_db)

    resp = client.get(f"/api/leads/run/{run_id}/export/csv")

    assert resp.status_code == 200
    assert "text/csv" in resp.headers["content-type"]


def test_export_includes_website_url(client, test_db):
    """CSV includes a website_url column with each lead's actual URL (or blank)."""
    run_id = _seed_run_with_leads(test_db)

    resp = client.get(f"/api/leads/run/{run_id}/export/csv")

    rows = _parse_csv(resp.text)
    by_name = {r["name"]: r["website_url"] for r in rows}
    assert by_name["Beta Plumber"] == "https://beta.example.com"
    assert by_name["Alpha Plumber"] == ""
