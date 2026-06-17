"""
Tests for GET /runs/monthly-spend (issue #0022).

Verifies that the endpoint returns correct per-group spend and remaining budget
for the current calendar month, and that prior-month runs are excluded.
"""

from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.main import app
from app.database import get_db
from app.models import Base, Run, Settings


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


def seed_settings(test_db, google_budget=200.0, apify_budget=5.0):
    db = test_db()
    try:
        db.add(Settings(google_places_monthly_budget_usd=google_budget, apify_monthly_budget_usd=apify_budget))
        db.commit()
    finally:
        db.close()


def seed_run(test_db, source: str, cost_usd: float, created_at: datetime):
    db = test_db()
    try:
        run = Run(
            config_yaml="queries:\n  - test\n",
            status="completed",
            source=source,
            cost_usd=cost_usd,
            created_at=created_at,
        )
        db.add(run)
        db.commit()
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Tracer bullet: endpoint exists and returns the expected structure
# ---------------------------------------------------------------------------


def test_monthly_spend_returns_expected_shape(client, test_db):
    """GET /runs/monthly-spend returns google_places and apify spend objects."""
    seed_settings(test_db)

    resp = client.get("/api/runs/monthly-spend")

    assert resp.status_code == 200
    data = resp.json()
    assert "google_places" in data
    assert "apify" in data
    for group in ("google_places", "apify"):
        assert "spent_usd" in data[group]
        assert "budget_usd" in data[group]
        assert "remaining_usd" in data[group]


# ---------------------------------------------------------------------------
# Spend calculation: current-month runs are included
# ---------------------------------------------------------------------------


def test_monthly_spend_includes_current_month_runs(client, test_db):
    """Runs created this calendar month are counted in the spend totals."""
    seed_settings(test_db, google_budget=200.0, apify_budget=5.0)

    today = datetime.utcnow()
    seed_run(test_db, source="google_places", cost_usd=0.48, created_at=today)
    seed_run(test_db, source="apify_google_maps", cost_usd=1.20, created_at=today)

    resp = client.get("/api/runs/monthly-spend")
    data = resp.json()

    assert abs(data["google_places"]["spent_usd"] - 0.48) < 0.001
    assert abs(data["google_places"]["remaining_usd"] - (200.0 - 0.48)) < 0.001
    assert data["google_places"]["budget_usd"] == 200.0

    assert abs(data["apify"]["spent_usd"] - 1.20) < 0.001
    assert abs(data["apify"]["remaining_usd"] - (5.0 - 1.20)) < 0.001
    assert data["apify"]["budget_usd"] == 5.0


# ---------------------------------------------------------------------------
# Month boundary: prior-month runs are excluded
# ---------------------------------------------------------------------------


def test_monthly_spend_excludes_prior_month_runs(client, test_db):
    """Runs from a previous calendar month are not counted in the current spend."""
    seed_settings(test_db, google_budget=200.0, apify_budget=5.0)

    today = datetime.utcnow()

    # Run from last month
    if today.month == 1:
        last_month = datetime(today.year - 1, 12, 15)
    else:
        last_month = datetime(today.year, today.month - 1, 15)

    seed_run(test_db, source="google_places", cost_usd=99.99, created_at=last_month)
    seed_run(test_db, source="apify_google_maps", cost_usd=4.00, created_at=last_month)

    resp = client.get("/api/runs/monthly-spend")
    data = resp.json()

    assert data["google_places"]["spent_usd"] == 0.0
    assert data["apify"]["spent_usd"] == 0.0


# ---------------------------------------------------------------------------
# Multiple source groups: apify aggregates both apify sources
# ---------------------------------------------------------------------------


def test_monthly_spend_aggregates_all_apify_sources(client, test_db):
    """Both apify_google_maps and apify_facebook_pages contribute to the apify total."""
    seed_settings(test_db, google_budget=200.0, apify_budget=5.0)

    today = datetime.utcnow()
    seed_run(test_db, source="apify_google_maps", cost_usd=1.00, created_at=today)
    seed_run(test_db, source="apify_facebook_pages", cost_usd=0.50, created_at=today)

    resp = client.get("/api/runs/monthly-spend")
    data = resp.json()

    assert abs(data["apify"]["spent_usd"] - 1.50) < 0.001


# ---------------------------------------------------------------------------
# Zero spend: no runs this month returns 0.0
# ---------------------------------------------------------------------------


def test_monthly_spend_returns_zero_when_no_runs(client, test_db):
    """When no runs exist for the current month, spent_usd is 0.0."""
    seed_settings(test_db)

    resp = client.get("/api/runs/monthly-spend")
    data = resp.json()

    assert data["google_places"]["spent_usd"] == 0.0
    assert data["apify"]["spent_usd"] == 0.0


# ---------------------------------------------------------------------------
# No settings row: endpoint returns 404
# ---------------------------------------------------------------------------


def test_monthly_spend_without_settings_returns_404(client, test_db):
    """When no Settings row exists, the endpoint returns 404."""
    # Do NOT seed settings — table is empty

    resp = client.get("/api/runs/monthly-spend")

    assert resp.status_code == 404
