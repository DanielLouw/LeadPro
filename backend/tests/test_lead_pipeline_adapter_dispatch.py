"""
Integration tests for execute_run() adapter dispatch (issue #0018).

These tests verify:
- execute_run() dispatches via the adapter registry (not direct scraper call)
- execute_run() writes cost_usd at completion for Google Places runs
- New YAML shape (source_config block) works correctly
- Legacy YAML (no source_config block, top-level queries) continues to work
"""

import math
from unittest.mock import patch, AsyncMock, MagicMock

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool

from app.config import PLACES_COST_PER_1000_REQUESTS, PLACES_RESULTS_PER_REQUEST
from app.models import Base, Run, Lead, RunStatus
from app.lead_pipeline.pipeline import execute_run
from app.places_scraper.scraper import RawBusiness


# ---------------------------------------------------------------------------
# Database fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def engine():
    eng = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=eng)
    yield eng
    Base.metadata.drop_all(bind=eng)


@pytest.fixture
def db(engine):
    SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    session = SessionLocal()
    yield session
    session.close()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_run(db: Session, config_yaml: str) -> Run:
    run = Run(config_yaml=config_yaml, status="pending", total_leads=0)
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


def _no_website_result():
    from app.gap_analyzer.analyzer import AnalysisResult, GapSignalResult
    return AnalysisResult(
        gap_signals=[GapSignalResult("no_website", True, "No website listed")],
        gap_score=10.0,
        has_hard_signal=True,
    )


GOOD_BIZ = RawBusiness(
    external_id="place_001",
    name="Good Plumber",
    address="1 Main St, Austin, TX 78701, USA",
    city="Austin",
    state="TX",
    phone="(512) 555-0001",
    website_url=None,
    maps_url="https://www.google.com/maps/place/?q=place_id:place_001",
)


# ---------------------------------------------------------------------------
# Cycle 6: execute_run() dispatches via adapter registry
# ---------------------------------------------------------------------------

async def test_execute_run_dispatches_via_adapter_registry(db):
    """
    execute_run() must call the adapter's fetch() method (via the registry),
    not call scrape_queries directly.  We verify by patching the adapter's
    fetch() method in the registry.
    """
    config_yaml = """\
source: google_places
max_results_per_run: 5
source_config:
  queries:
    - plumbers in Austin TX
"""
    run = make_run(db, config_yaml)

    mock_fetch = AsyncMock(return_value=[GOOD_BIZ])

    with patch("app.lead_pipeline.pipeline.ADAPTER_REGISTRY") as mock_registry:
        mock_adapter = MagicMock()
        mock_adapter.fetch = mock_fetch
        mock_registry.__getitem__ = MagicMock(return_value=mock_adapter)

        with patch("app.lead_pipeline.pipeline.analyze", side_effect=lambda url: _no_website_result()):
            await execute_run(run.id, db)

    mock_fetch.assert_called_once()
    call_kwargs = mock_fetch.call_args
    assert call_kwargs.kwargs["max_results"] == 5


# ---------------------------------------------------------------------------
# Cycle 7: execute_run() passes source_config block to adapter
# ---------------------------------------------------------------------------

async def test_execute_run_passes_source_config_to_adapter(db):
    """
    execute_run() must extract the source_config block from config_yaml
    and pass it to the adapter's fetch() call.
    """
    config_yaml = """\
source: google_places
max_results_per_run: 5
source_config:
  queries:
    - electricians in Dallas TX
"""
    run = make_run(db, config_yaml)

    captured_source_config: list[dict] = []

    async def mock_fetch(*, source_config, max_results, **kwargs):
        captured_source_config.append(dict(source_config))
        return []

    with patch("app.lead_pipeline.pipeline.ADAPTER_REGISTRY") as mock_registry:
        mock_adapter = MagicMock()
        mock_adapter.fetch = mock_fetch
        mock_registry.__getitem__ = MagicMock(return_value=mock_adapter)

        with patch("app.lead_pipeline.pipeline.analyze", side_effect=lambda url: _no_website_result()):
            await execute_run(run.id, db)

    assert captured_source_config == [{"queries": ["electricians in Dallas TX"]}]


# ---------------------------------------------------------------------------
# Cycle 8: execute_run() writes cost_usd at completion
# ---------------------------------------------------------------------------

async def test_execute_run_writes_cost_usd_at_completion(db):
    """
    After a google_places run completes, run.cost_usd must be set using the
    standard cost formula: ceil(results / PLACES_RESULTS_PER_REQUEST) *
    (PLACES_COST_PER_1000_REQUESTS / 1000).
    """
    config_yaml = """\
source: google_places
max_results_per_run: 10
source_config:
  queries:
    - plumbers in Austin TX
"""
    run = make_run(db, config_yaml)

    # Scraper returns 1 business → 1 API request → cost = 1 * (32/1000) = 0.032
    with patch("app.lead_pipeline.pipeline.scrape_queries", return_value=[GOOD_BIZ]):
        with patch("app.lead_pipeline.pipeline.analyze", side_effect=lambda url: _no_website_result()):
            await execute_run(run.id, db)

    db.refresh(run)
    assert run.status == RunStatus.completed.value
    assert run.cost_usd is not None

    expected_requests = math.ceil(1 / PLACES_RESULTS_PER_REQUEST)
    expected_cost = expected_requests * (PLACES_COST_PER_1000_REQUESTS / 1000)
    assert abs(run.cost_usd - expected_cost) < 1e-9


# ---------------------------------------------------------------------------
# Cycle 9: Legacy YAML (no source_config block) still works
# ---------------------------------------------------------------------------

async def test_execute_run_supports_legacy_yaml_without_source_config(db):
    """
    Runs with legacy config_yaml (no source_config block, top-level queries)
    must complete successfully and produce leads exactly as before.
    """
    config_yaml = """\
queries:
  - plumbers in Austin TX
max_results_per_run: 5
"""
    run = make_run(db, config_yaml)

    with patch("app.lead_pipeline.pipeline.scrape_queries", return_value=[GOOD_BIZ]):
        with patch("app.lead_pipeline.pipeline.analyze", side_effect=lambda url: _no_website_result()):
            await execute_run(run.id, db)

    db.refresh(run)
    assert run.status == RunStatus.completed.value
    assert run.total_leads == 1


# ---------------------------------------------------------------------------
# Cycle 10: New YAML shape (with source_config block) works
# ---------------------------------------------------------------------------

async def test_execute_run_supports_new_yaml_with_source_config(db):
    """
    Runs with the new source_config YAML shape must complete successfully.
    """
    config_yaml = """\
source: google_places
max_results_per_run: 5
source_config:
  queries:
    - plumbers in Austin TX
"""
    run = make_run(db, config_yaml)

    with patch("app.lead_pipeline.pipeline.scrape_queries", return_value=[GOOD_BIZ]):
        with patch("app.lead_pipeline.pipeline.analyze", side_effect=lambda url: _no_website_result()):
            await execute_run(run.id, db)

    db.refresh(run)
    assert run.status == RunStatus.completed.value
    assert run.total_leads == 1


# ---------------------------------------------------------------------------
# Cycle 11: execute_run() writes cost_usd for apify_facebook_pages runs
# ---------------------------------------------------------------------------

async def test_execute_run_writes_cost_usd_for_apify_facebook_pages(db):
    """
    After an apify_facebook_pages run completes, run.cost_usd must be set using
    the Apify Facebook Pages rate: total_leads * APIFY_FACEBOOK_PAGES_COST_PER_LEAD.
    """
    from app.config import APIFY_FACEBOOK_PAGES_COST_PER_LEAD

    config_yaml = """\
source: apify_facebook_pages
max_results_per_run: 10
source_config:
  query: plumbers Austin Texas
"""
    run = make_run(db, config_yaml)
    run.source = "apify_facebook_pages"
    db.commit()

    fb_biz = RawBusiness(
        external_id="fb_page_001",
        name="Austin Plumbers Co",
        address=None,
        city=None,
        state=None,
        phone="+1-512-555-0001",
        website_url=None,
        maps_url=None,
    )

    with patch("app.lead_pipeline.pipeline.ADAPTER_REGISTRY") as mock_registry:
        mock_adapter = MagicMock()
        mock_adapter.fetch = AsyncMock(return_value=[fb_biz])
        mock_registry.__getitem__ = MagicMock(return_value=mock_adapter)

        with patch("app.lead_pipeline.pipeline.analyze", side_effect=lambda url: _no_website_result()):
            await execute_run(run.id, db)

    db.refresh(run)
    assert run.status == RunStatus.completed.value
    assert run.cost_usd is not None
    expected_cost = run.total_leads * APIFY_FACEBOOK_PAGES_COST_PER_LEAD
    assert abs(run.cost_usd - expected_cost) < 1e-9


# ---------------------------------------------------------------------------
# Cycle 12: execute_run() writes cost_usd for apify_google_maps runs
# ---------------------------------------------------------------------------

async def test_execute_run_writes_cost_usd_for_apify_google_maps(db):
    """
    After an apify_google_maps run completes, run.cost_usd must be set using
    the Apify Google Maps rate: total_leads * APIFY_GOOGLE_MAPS_COST_PER_LEAD.
    """
    from app.config import APIFY_GOOGLE_MAPS_COST_PER_LEAD

    config_yaml = """\
source: apify_google_maps
max_results_per_run: 10
source_config:
  search_term: plumbers
  city: Austin
  state: TX
"""
    run = make_run(db, config_yaml)
    run.source = "apify_google_maps"
    db.commit()

    with patch("app.lead_pipeline.pipeline.ADAPTER_REGISTRY") as mock_registry:
        mock_adapter = MagicMock()
        mock_adapter.fetch = AsyncMock(return_value=[GOOD_BIZ])
        mock_registry.__getitem__ = MagicMock(return_value=mock_adapter)

        with patch("app.lead_pipeline.pipeline.analyze", side_effect=lambda url: _no_website_result()):
            await execute_run(run.id, db)

    db.refresh(run)
    assert run.status == RunStatus.completed.value
    assert run.cost_usd is not None
    assert abs(run.cost_usd - (1 * APIFY_GOOGLE_MAPS_COST_PER_LEAD)) < 1e-9
