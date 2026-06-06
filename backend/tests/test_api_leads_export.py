"""
API tests for GET /runs/{run_id}/leads/export (issue #0010).

Uses FastAPI TestClient with an isolated in-memory SQLite instance per test.
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


def _seed_run_with_leads(test_db) -> tuple[int, list[int]]:
    """Create a completed run with two leads (one with a note, one without)."""
    db = test_db()
    try:
        run = Run(config_yaml="queries:\n  - test\n", status="completed", total_leads=2)
        db.add(run)
        db.flush()

        lead1 = Lead(
            run_id=run.id,
            place_id="place_001",
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
        db.add(lead1)
        db.flush()
        db.add(GapSignal(lead_id=lead1.id, signal_type="no_website", is_hard=True, description="No website listed"))
        db.add(GapSignal(lead_id=lead1.id, signal_type="missing_meta", is_hard=False, description="Missing meta description"))
        db.add(Note(lead_id=lead1.id, content="Follow up Monday"))

        lead2 = Lead(
            run_id=run.id,
            place_id="place_002",
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
        db.add(lead2)
        db.flush()
        db.add(GapSignal(lead_id=lead2.id, signal_type="no_https", is_hard=True, description="No HTTPS"))

        db.commit()
        return run.id, [lead1.id, lead2.id]
    finally:
        db.close()


def _parse_csv(content: str) -> list[dict]:
    reader = csv.DictReader(io.StringIO(content))
    return list(reader)


# ---------------------------------------------------------------------------
# Tests — Tracer bullet: endpoint exists and returns CSV
# ---------------------------------------------------------------------------


def test_export_returns_csv_content_type(client, test_db):
    """GET /runs/{id}/leads/export returns Content-Type: text/csv."""
    run_id, _ = _seed_run_with_leads(test_db)

    resp = client.get(f"/runs/{run_id}/leads/export")

    assert resp.status_code == 200
    assert "text/csv" in resp.headers["content-type"]


def test_export_returns_attachment_disposition(client, test_db):
    """GET /runs/{id}/leads/export sets Content-Disposition: attachment."""
    run_id, _ = _seed_run_with_leads(test_db)

    resp = client.get(f"/runs/{run_id}/leads/export")

    disposition = resp.headers.get("content-disposition", "")
    assert "attachment" in disposition
    assert "leads" in disposition  # filename contains "leads"


# ---------------------------------------------------------------------------
# CSV field completeness
# ---------------------------------------------------------------------------


def test_export_csv_contains_all_required_columns(client, test_db):
    """CSV header includes all required fields."""
    run_id, _ = _seed_run_with_leads(test_db)

    resp = client.get(f"/runs/{run_id}/leads/export")

    rows = _parse_csv(resp.text)
    assert len(rows) > 0
    required_columns = {"name", "address", "phone", "email", "gap_score", "gap_signals", "status", "notes"}
    assert required_columns.issubset(set(rows[0].keys()))


def test_export_csv_field_values_are_correct(client, test_db):
    """CSV rows contain the correct values for each lead."""
    run_id, _ = _seed_run_with_leads(test_db)

    resp = client.get(f"/runs/{run_id}/leads/export")

    rows = _parse_csv(resp.text)
    alpha = next(r for r in rows if r["name"] == "Alpha Plumber")

    assert alpha["phone"] == "(512) 555-0001"
    assert alpha["address"] == "1 Main St"
    assert alpha["email"] == "alpha@example.com"
    assert alpha["gap_score"] == "10.0"
    assert alpha["status"] == "new"
    assert alpha["notes"] == "Follow up Monday"


# ---------------------------------------------------------------------------
# Gap signals formatted as comma-separated readable string
# ---------------------------------------------------------------------------


def test_export_gap_signals_comma_separated(client, test_db):
    """Gap signal descriptions are joined with ', ' (comma-space)."""
    run_id, _ = _seed_run_with_leads(test_db)

    resp = client.get(f"/runs/{run_id}/leads/export")

    rows = _parse_csv(resp.text)
    alpha = next(r for r in rows if r["name"] == "Alpha Plumber")

    # Should contain both signal descriptions joined by comma
    signals = alpha["gap_signals"]
    assert "No website listed" in signals
    assert "Missing meta description" in signals
    # Comma-separated (not semicolon)
    assert ", " in signals or "," in signals
    assert ";" not in signals


# ---------------------------------------------------------------------------
# Empty notes export as blank
# ---------------------------------------------------------------------------


def test_export_empty_notes_are_blank(client, test_db):
    """Leads with no note export an empty string, not 'None' or 'null'."""
    run_id, _ = _seed_run_with_leads(test_db)

    resp = client.get(f"/runs/{run_id}/leads/export")

    rows = _parse_csv(resp.text)
    beta = next(r for r in rows if r["name"] == "Beta Plumber")

    assert beta["notes"] == ""
    assert beta["notes"] != "None"
    assert beta["notes"] != "null"


# ---------------------------------------------------------------------------
# Export with no leads
# ---------------------------------------------------------------------------


def test_export_with_no_leads_returns_header_only(client, test_db):
    """When run has no leads, export returns only the CSV header row."""
    db = test_db()
    try:
        run = Run(config_yaml="queries:\n  - empty\n", status="completed", total_leads=0)
        db.add(run)
        db.commit()
        run_id = run.id
    finally:
        db.close()

    resp = client.get(f"/runs/{run_id}/leads/export")

    assert resp.status_code == 200
    rows = _parse_csv(resp.text)
    assert rows == []  # no data rows, only header


# ---------------------------------------------------------------------------
# Export respects status filter
# ---------------------------------------------------------------------------


def test_export_with_status_filter_excludes_other_statuses(client, test_db):
    """When status filter is applied, only matching leads appear in CSV."""
    run_id, _ = _seed_run_with_leads(test_db)

    resp = client.get(f"/runs/{run_id}/leads/export?status=new")

    assert resp.status_code == 200
    rows = _parse_csv(resp.text)
    # Only lead1 has status=new; lead2 has status=reviewing
    assert len(rows) == 1
    assert rows[0]["name"] == "Alpha Plumber"


def test_export_with_min_gap_score_filter(client, test_db):
    """min_gap_score filter excludes leads below the threshold."""
    run_id, _ = _seed_run_with_leads(test_db)

    resp = client.get(f"/runs/{run_id}/leads/export?min_gap_score=8")

    assert resp.status_code == 200
    rows = _parse_csv(resp.text)
    # Only lead1 has gap_score=10.0; lead2 has 4.0
    assert len(rows) == 1
    assert rows[0]["name"] == "Alpha Plumber"


# ---------------------------------------------------------------------------
# 404 for unknown run
# ---------------------------------------------------------------------------


def test_export_returns_404_for_unknown_run(client, test_db):
    """GET /runs/{id}/leads/export returns 404 when run does not exist."""
    resp = client.get("/runs/99999/leads/export")

    assert resp.status_code == 404
