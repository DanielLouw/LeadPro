"""
Tests for budget estimation and monthly spend functions (issue #0021).
"""

import math
from datetime import date

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import Base, Run
from app.budget import estimate_run_cost, get_monthly_spend


# ---------------------------------------------------------------------------
# In-memory DB fixture
# ---------------------------------------------------------------------------

@pytest.fixture
def db():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    session = Session()
    yield session
    session.close()
    Base.metadata.drop_all(bind=engine)


# ---------------------------------------------------------------------------
# estimate_run_cost — google_places
# ---------------------------------------------------------------------------

def test_estimate_google_places_single_page():
    """20 results = 1 page = 1 * 0.032 = 0.032."""
    assert estimate_run_cost("google_places", 20) == pytest.approx(0.032)


def test_estimate_google_places_multiple_pages():
    """21 results = 2 pages = 2 * 0.032 = 0.064."""
    assert estimate_run_cost("google_places", 21) == pytest.approx(0.064)


def test_estimate_google_places_exact_two_pages():
    """40 results = 2 pages = 0.064."""
    assert estimate_run_cost("google_places", 40) == pytest.approx(0.064)


def test_estimate_google_places_one_result():
    """1 result → ceil(1/20)=1 page = 0.032."""
    assert estimate_run_cost("google_places", 1) == pytest.approx(0.032)


# ---------------------------------------------------------------------------
# estimate_run_cost — apify_google_maps
# ---------------------------------------------------------------------------

def test_estimate_apify_google_maps():
    """100 results * 0.004 = 0.40."""
    assert estimate_run_cost("apify_google_maps", 100) == pytest.approx(0.40)


def test_estimate_apify_google_maps_single():
    assert estimate_run_cost("apify_google_maps", 1) == pytest.approx(0.004)


# ---------------------------------------------------------------------------
# estimate_run_cost — apify_facebook_pages
# ---------------------------------------------------------------------------

def test_estimate_apify_facebook_pages():
    """50 results * 0.010 = 0.50."""
    assert estimate_run_cost("apify_facebook_pages", 50) == pytest.approx(0.50)


def test_estimate_apify_facebook_pages_single():
    assert estimate_run_cost("apify_facebook_pages", 1) == pytest.approx(0.010)


# ---------------------------------------------------------------------------
# get_monthly_spend — google_places group
# ---------------------------------------------------------------------------

def _make_run(db, source: str, cost: float, created_at: date) -> None:
    from datetime import datetime
    run = Run(
        config_yaml="queries:\n  - test\n",
        status="completed",
        source=source,
        cost_usd=cost,
        created_at=datetime(created_at.year, created_at.month, created_at.day, 12, 0, 0),
    )
    db.add(run)
    db.commit()


def test_get_monthly_spend_google_places_single_run(db):
    """Single google_places run in the month is returned."""
    _make_run(db, "google_places", 1.50, date(2026, 6, 1))
    spend = get_monthly_spend(db, "google_places", date(2026, 6, 1))
    assert spend == pytest.approx(1.50)


def test_get_monthly_spend_google_places_sums_multiple(db):
    """Multiple google_places runs in same month are summed."""
    _make_run(db, "google_places", 1.00, date(2026, 6, 1))
    _make_run(db, "google_places", 2.50, date(2026, 6, 15))
    spend = get_monthly_spend(db, "google_places", date(2026, 6, 1))
    assert spend == pytest.approx(3.50)


def test_get_monthly_spend_excludes_prior_month(db):
    """Runs from a prior month are excluded."""
    _make_run(db, "google_places", 5.00, date(2026, 5, 31))  # prior month
    _make_run(db, "google_places", 1.00, date(2026, 6, 1))
    spend = get_monthly_spend(db, "google_places", date(2026, 6, 1))
    assert spend == pytest.approx(1.00)


def test_get_monthly_spend_excludes_next_month(db):
    """Runs from the next month are excluded."""
    _make_run(db, "google_places", 1.00, date(2026, 6, 1))
    _make_run(db, "google_places", 5.00, date(2026, 7, 1))  # next month
    spend = get_monthly_spend(db, "google_places", date(2026, 6, 1))
    assert spend == pytest.approx(1.00)


def test_get_monthly_spend_zero_when_no_runs(db):
    """Returns 0.0 when no runs exist for the period."""
    spend = get_monthly_spend(db, "google_places", date(2026, 6, 1))
    assert spend == pytest.approx(0.0)


# ---------------------------------------------------------------------------
# get_monthly_spend — apify group
# ---------------------------------------------------------------------------

def test_get_monthly_spend_apify_aggregates_both_sources(db):
    """Apify group sums both apify_google_maps and apify_facebook_pages."""
    _make_run(db, "apify_google_maps", 0.40, date(2026, 6, 1))
    _make_run(db, "apify_facebook_pages", 0.50, date(2026, 6, 10))
    spend = get_monthly_spend(db, "apify", date(2026, 6, 1))
    assert spend == pytest.approx(0.90)


def test_get_monthly_spend_apify_excludes_google_places(db):
    """Apify group does not include google_places runs."""
    _make_run(db, "google_places", 99.00, date(2026, 6, 1))
    _make_run(db, "apify_google_maps", 0.40, date(2026, 6, 1))
    spend = get_monthly_spend(db, "apify", date(2026, 6, 1))
    assert spend == pytest.approx(0.40)


def test_get_monthly_spend_handles_null_cost_usd(db):
    """Runs with NULL cost_usd are treated as 0."""
    from datetime import datetime
    run = Run(
        config_yaml="queries:\n  - test\n",
        status="completed",
        source="google_places",
        cost_usd=None,
        created_at=datetime(2026, 6, 5, 12, 0, 0),
    )
    db.add(run)
    db.commit()
    spend = get_monthly_spend(db, "google_places", date(2026, 6, 1))
    assert spend == pytest.approx(0.0)
