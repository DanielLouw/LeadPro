"""
API tests for GET /settings and PATCH /settings (issue #0021).

Uses FastAPI TestClient with an isolated in-memory SQLite instance per test.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.main import app
from app.database import get_db
from app.models import Base, Settings


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

    # Seed the settings row (mirrors startup logic)
    seed_db = TestingSession()
    seed_db.add(Settings(google_places_monthly_budget_usd=200.0, apify_monthly_budget_usd=5.0))
    seed_db.commit()
    seed_db.close()

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
# GET /settings
# ---------------------------------------------------------------------------

def test_get_settings_returns_budget_values(client):
    """GET /settings returns the seeded budget values."""
    resp = client.get("/settings")
    assert resp.status_code == 200
    data = resp.json()
    assert data["google_places_monthly_budget_usd"] == pytest.approx(200.0)
    assert data["apify_monthly_budget_usd"] == pytest.approx(5.0)


# ---------------------------------------------------------------------------
# PATCH /settings
# ---------------------------------------------------------------------------

def test_patch_settings_updates_google_places_budget(client):
    """PATCH /settings updates the google_places budget."""
    resp = client.patch("/settings", json={"google_places_monthly_budget_usd": 300.0})
    assert resp.status_code == 200
    data = resp.json()
    assert data["google_places_monthly_budget_usd"] == pytest.approx(300.0)
    # apify budget unchanged
    assert data["apify_monthly_budget_usd"] == pytest.approx(5.0)


def test_patch_settings_updates_apify_budget(client):
    """PATCH /settings updates the apify budget."""
    resp = client.patch("/settings", json={"apify_monthly_budget_usd": 50.0})
    assert resp.status_code == 200
    data = resp.json()
    assert data["apify_monthly_budget_usd"] == pytest.approx(50.0)
    assert data["google_places_monthly_budget_usd"] == pytest.approx(200.0)


def test_patch_settings_updates_both_budgets(client):
    """PATCH /settings updates both budgets in a single call."""
    resp = client.patch("/settings", json={
        "google_places_monthly_budget_usd": 150.0,
        "apify_monthly_budget_usd": 25.0,
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["google_places_monthly_budget_usd"] == pytest.approx(150.0)
    assert data["apify_monthly_budget_usd"] == pytest.approx(25.0)


def test_patch_settings_persists_to_db(client, test_db):
    """PATCH /settings persists the updated value."""
    client.patch("/settings", json={"google_places_monthly_budget_usd": 99.0})
    db = test_db()
    try:
        row = db.query(Settings).first()
        assert row.google_places_monthly_budget_usd == pytest.approx(99.0)
    finally:
        db.close()


def test_patch_settings_rejects_zero_google_places(client):
    """PATCH /settings rejects google_places budget of 0."""
    resp = client.patch("/settings", json={"google_places_monthly_budget_usd": 0.0})
    assert resp.status_code == 422


def test_patch_settings_rejects_negative_google_places(client):
    """PATCH /settings rejects negative google_places budget."""
    resp = client.patch("/settings", json={"google_places_monthly_budget_usd": -10.0})
    assert resp.status_code == 422


def test_patch_settings_rejects_zero_apify(client):
    """PATCH /settings rejects apify budget of 0."""
    resp = client.patch("/settings", json={"apify_monthly_budget_usd": 0.0})
    assert resp.status_code == 422


def test_patch_settings_rejects_negative_apify(client):
    """PATCH /settings rejects negative apify budget."""
    resp = client.patch("/settings", json={"apify_monthly_budget_usd": -5.0})
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# apify_api_key — Cycles added for Apify API key support
# ---------------------------------------------------------------------------

def test_get_settings_returns_apify_api_key(client):
    """GET /settings response includes apify_api_key (empty string by default)."""
    resp = client.get("/settings")
    assert resp.status_code == 200
    data = resp.json()
    assert "apify_api_key" in data
    assert data["apify_api_key"] == ""


def test_patch_settings_saves_apify_api_key(client):
    """PATCH /settings with apify_api_key persists and returns the new value."""
    resp = client.patch("/settings", json={"apify_api_key": "apify_abc123"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["apify_api_key"] == "apify_abc123"
    # Re-fetch to confirm persistence
    resp2 = client.get("/settings")
    assert resp2.json()["apify_api_key"] == "apify_abc123"
