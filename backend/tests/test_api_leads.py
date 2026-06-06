"""
API tests for lead detail endpoints (issue #0007).

Covers:
  - PATCH /leads/:id/status — valid transitions, invalid status rejected, 404 on missing lead
  - PATCH /leads/:id/notes  — save notes, empty note, 404 on missing lead
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.main import app
from app.database import get_db
from app.models import Base, Run, Lead, GapSignal, Note


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

def _seed_lead(test_db, *, status: str = "new") -> int:
    """Insert a run + lead into the test DB, return the lead id."""
    db = test_db()
    try:
        run = Run(config_yaml="queries:\n  - test\n", status="completed")
        db.add(run)
        db.flush()
        lead = Lead(
            run_id=run.id,
            place_id="place_001",
            name="Test Business",
            phone="(512) 555-0001",
            address="1 Main St",
            city="Austin",
            state="TX",
            gap_score=8.0,
            status=status,
        )
        db.add(lead)
        db.flush()
        db.add(GapSignal(
            lead_id=lead.id,
            signal_type="no_https",
            is_hard=True,
            description="No HTTPS — this site is not secure",
        ))
        db.commit()
        return lead.id
    finally:
        db.close()


# ---------------------------------------------------------------------------
# PATCH /leads/:id/status
# ---------------------------------------------------------------------------

class TestPatchLeadStatus:
    def test_valid_status_transition_returns_200(self, client, test_db):
        """PATCH /leads/:id/status with a valid status returns 200 and updated lead."""
        lead_id = _seed_lead(test_db)
        resp = client.patch(f"/leads/{lead_id}/status", json={"status": "reviewing"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "reviewing"

    def test_status_persisted_to_db(self, client, test_db):
        """Status change is reflected when the lead is fetched again."""
        lead_id = _seed_lead(test_db)
        client.patch(f"/leads/{lead_id}/status", json={"status": "contacted"})
        resp = client.get(f"/leads/{lead_id}")
        assert resp.json()["status"] == "contacted"

    def test_all_valid_statuses_accepted(self, client, test_db):
        """All four valid statuses — new, reviewing, contacted, pass — are accepted."""
        for status in ("new", "reviewing", "contacted", "pass"):
            lead_id = _seed_lead(test_db)
            resp = client.patch(f"/leads/{lead_id}/status", json={"status": status})
            assert resp.status_code == 200, f"Expected 200 for status={status!r}"

    def test_invalid_status_returns_422(self, client, test_db):
        """PATCH /leads/:id/status with an invalid status value returns 422."""
        lead_id = _seed_lead(test_db)
        resp = client.patch(f"/leads/{lead_id}/status", json={"status": "archived"})
        assert resp.status_code == 422

    def test_missing_lead_returns_404(self, client, test_db):
        """PATCH /leads/9999/status returns 404 when the lead does not exist."""
        resp = client.patch("/leads/9999/status", json={"status": "reviewing"})
        assert resp.status_code == 404

    def test_response_includes_gap_signals(self, client, test_db):
        """Response body for a status update includes gap_signals."""
        lead_id = _seed_lead(test_db)
        resp = client.patch(f"/leads/{lead_id}/status", json={"status": "pass"})
        data = resp.json()
        assert len(data["gap_signals"]) == 1
        assert data["gap_signals"][0]["signal_type"] == "no_https"


# ---------------------------------------------------------------------------
# PATCH /leads/:id/notes
# ---------------------------------------------------------------------------

class TestPatchLeadNotes:
    def test_save_note_returns_200(self, client, test_db):
        """PATCH /leads/:id/notes saves a note and returns 200 with updated lead."""
        lead_id = _seed_lead(test_db)
        resp = client.patch(f"/leads/{lead_id}/notes", json={"content": "Follow up next Monday"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["note"]["content"] == "Follow up next Monday"

    def test_note_persisted_to_db(self, client, test_db):
        """Note is retrievable on subsequent GET."""
        lead_id = _seed_lead(test_db)
        client.patch(f"/leads/{lead_id}/notes", json={"content": "Important client"})
        resp = client.get(f"/leads/{lead_id}")
        assert resp.json()["note"]["content"] == "Important client"

    def test_update_existing_note(self, client, test_db):
        """Calling PATCH /notes twice replaces the note content."""
        lead_id = _seed_lead(test_db)
        client.patch(f"/leads/{lead_id}/notes", json={"content": "First note"})
        client.patch(f"/leads/{lead_id}/notes", json={"content": "Updated note"})
        resp = client.get(f"/leads/{lead_id}")
        assert resp.json()["note"]["content"] == "Updated note"

    def test_empty_note_content_accepted(self, client, test_db):
        """Empty string content is a valid note (clearing a note)."""
        lead_id = _seed_lead(test_db)
        resp = client.patch(f"/leads/{lead_id}/notes", json={"content": ""})
        assert resp.status_code == 200
        assert resp.json()["note"]["content"] == ""

    def test_missing_lead_returns_404(self, client, test_db):
        """PATCH /leads/9999/notes returns 404 when the lead does not exist."""
        resp = client.patch("/leads/9999/notes", json={"content": "Ghost note"})
        assert resp.status_code == 404
