"""
API tests for GET /leads/export — all-leads CSV export.
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
# Fixtures
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

def _seed(test_db) -> None:
    """Two runs, three leads across TX and CA with varied statuses/signals."""
    db = test_db()
    try:
        run1 = Run(config_yaml="source: google_places\n", status="completed", total_leads=2)
        run2 = Run(config_yaml="source: google_places\n", status="completed", total_leads=1)
        db.add_all([run1, run2])
        db.flush()

        lead1 = Lead(run_id=run1.id, external_id="p1", name="Alpha Plumber",
                     phone="(512) 555-0001", address="1 Main St", city="Austin", state="TX",
                     email="alpha@example.com", website_url=None, maps_url="https://maps/1",
                     gap_score=10.0, status="new")
        lead2 = Lead(run_id=run1.id, external_id="p2", name="Beta HVAC",
                     phone=None, address="2 Oak Ave", city="Dallas", state="TX",
                     email=None, website_url="https://beta.com", maps_url="https://maps/2",
                     gap_score=6.0, status="reviewing")
        lead3 = Lead(run_id=run2.id, external_id="p3", name="Gamma Roofing",
                     phone="(310) 555-0003", address="3 Elm St", city="Los Angeles", state="CA",
                     email=None, website_url=None, maps_url="https://maps/3",
                     gap_score=8.0, status="new")
        db.add_all([lead1, lead2, lead3])
        db.flush()

        db.add(GapSignal(lead_id=lead1.id, signal_type="no_website", is_hard=True, description="No website"))
        db.add(GapSignal(lead_id=lead2.id, signal_type="no_https", is_hard=True, description="No HTTPS"))
        db.add(GapSignal(lead_id=lead3.id, signal_type="no_website", is_hard=True, description="No website"))
        db.add(Note(lead_id=lead1.id, content="Call Monday"))
        db.commit()
    finally:
        db.close()


def _parse_csv(text: str) -> list[dict]:
    return list(csv.DictReader(io.StringIO(text)))


# ---------------------------------------------------------------------------
# Tracer bullet: endpoint exists, returns CSV
# ---------------------------------------------------------------------------

def test_export_returns_csv_content_type(client, test_db):
    """GET /leads/export returns Content-Type: text/csv."""
    _seed(test_db)
    resp = client.get("/api/leads/export")
    assert resp.status_code == 200
    assert "text/csv" in resp.headers["content-type"]


def test_export_returns_attachment_disposition(client, test_db):
    """GET /leads/export sets Content-Disposition: attachment."""
    _seed(test_db)
    resp = client.get("/api/leads/export")
    disposition = resp.headers.get("content-disposition", "")
    assert "attachment" in disposition
    assert "leads" in disposition


def test_export_contains_required_columns(client, test_db):
    """CSV header includes all required fields."""
    _seed(test_db)
    resp = client.get("/api/leads/export")
    rows = _parse_csv(resp.text)
    assert len(rows) > 0
    required = {"name", "address", "city", "state", "phone", "email", "gap_score", "gap_signals", "status", "notes"}
    assert required.issubset(set(rows[0].keys()))


def test_export_filters_by_status(client, test_db):
    """?statuses=new returns only leads with status=new."""
    _seed(test_db)
    resp = client.get("/api/leads/export?statuses=new")
    rows = _parse_csv(resp.text)
    assert all(r["status"] == "new" for r in rows)
    assert len(rows) == 2  # Alpha (TX) and Gamma (CA)


def test_export_filters_by_state(client, test_db):
    """?states=CA returns only California leads."""
    _seed(test_db)
    resp = client.get("/api/leads/export?states=CA")
    rows = _parse_csv(resp.text)
    assert all(r["state"] == "CA" for r in rows)
    assert len(rows) == 1
    assert rows[0]["name"] == "Gamma Roofing"


def test_export_filters_by_search(client, test_db):
    """?search=alpha returns only leads whose name contains 'alpha' (case-insensitive)."""
    _seed(test_db)
    resp = client.get("/api/leads/export?search=alpha")
    rows = _parse_csv(resp.text)
    assert len(rows) == 1
    assert rows[0]["name"] == "Alpha Plumber"


def test_export_filters_by_signal_type(client, test_db):
    """?signal_types=no_https returns only leads with that signal."""
    _seed(test_db)
    resp = client.get("/api/leads/export?signal_types=no_https")
    rows = _parse_csv(resp.text)
    assert len(rows) == 1
    assert rows[0]["name"] == "Beta HVAC"


def test_export_no_leads_returns_header_only(client, test_db):
    """When no leads exist, export returns only the CSV header row."""
    resp = client.get("/api/leads/export")
    rows = _parse_csv(resp.text)
    assert rows == []
