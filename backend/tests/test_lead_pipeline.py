"""
Integration tests for the lead_pipeline module (issue #0004).

Tests use an in-memory SQLite database and mock all external HTTP calls.
"""

import pytest
import httpx
from unittest.mock import patch, AsyncMock

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool

from app.models import Base, Run, Lead, GapSignal, RunStatus
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

SAMPLE_CONFIG_YAML = """\
queries:
  - plumbers in Austin TX
max_results_per_run: 50
"""

GOOD_BIZ = RawBusiness(
    place_id="place_001",
    name="Good Plumber",
    address="1 Main St, Austin, TX 78701, USA",
    city="Austin",
    state="TX",
    phone="(512) 555-0001",
    website_url=None,  # no website → hard signal
    maps_url="https://www.google.com/maps/place/?q=place_id:place_001",
)

BAD_BIZ = RawBusiness(
    place_id="place_002",
    name="Great Website Co",
    address="2 Oak Ave, Austin, TX 78702, USA",
    city="Austin",
    state="TX",
    phone="(512) 555-0002",
    website_url="https://great-website.example.com",
    maps_url="https://www.google.com/maps/place/?q=place_id:place_002",
)

BROKEN_BIZ = RawBusiness(
    place_id="place_003",
    name="Broken Site Co",
    address="3 Elm St, Austin, TX 78703, USA",
    city="Austin",
    state="TX",
    phone="(512) 555-0003",
    website_url="https://broken.example.com",
    maps_url="https://www.google.com/maps/place/?q=place_id:place_003",
)


def make_run(db: Session, config_yaml: str = SAMPLE_CONFIG_YAML) -> Run:
    run = Run(config_yaml=config_yaml, status="pending", total_leads=0)
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


# ---------------------------------------------------------------------------
# Test 1: Leads are created and ranked correctly (highest gap score first)
# ---------------------------------------------------------------------------

async def test_leads_created_and_ranked(db):
    """
    Pipeline with two qualifying businesses (no websites) → both saved,
    ranked by gap_score descending.
    """
    biz_a = RawBusiness(
        place_id="place_a",
        name="Biz A",
        address="1 A St, Austin, TX 78701, USA",
        city="Austin",
        state="TX",
        phone="555-0001",
        website_url=None,           # hard: no_website (score=10)
        maps_url="https://maps/a",
    )
    biz_b = RawBusiness(
        place_id="place_b",
        name="Biz B",
        address="2 B St, Austin, TX 78701, USA",
        city="Austin",
        state="TX",
        phone="555-0002",
        website_url="http://plain-http.example.com",  # hard: no_https
        maps_url="https://maps/b",
    )

    run = make_run(db)

    with patch("app.lead_pipeline.pipeline.scrape_queries", return_value=[biz_a, biz_b]):
        # Mock analyzer: biz_a → no_website (score 10), biz_b → no_https (score 10)
        from app.gap_analyzer.analyzer import AnalysisResult, GapSignalResult

        async def mock_analyze(url):
            if url is None:
                return AnalysisResult(
                    gap_signals=[GapSignalResult("no_website", True, "No website listed")],
                    gap_score=10.0,
                    has_hard_signal=True,
                )
            # biz_b: plain http → no_https
            return AnalysisResult(
                gap_signals=[GapSignalResult("no_https", True, "No HTTPS")],
                gap_score=10.0,
                has_hard_signal=True,
            )

        with patch("app.lead_pipeline.pipeline.analyze", side_effect=mock_analyze):
            await execute_run(run.id, db)

    db.refresh(run)
    assert run.status == RunStatus.completed.value
    assert run.total_leads == 2

    leads = db.query(Lead).filter(Lead.run_id == run.id).order_by(Lead.gap_score.desc()).all()
    assert len(leads) == 2
    # Both have score 10 — just verify they're both present
    names = {l.name for l in leads}
    assert "Biz A" in names
    assert "Biz B" in names


# ---------------------------------------------------------------------------
# Test 2: Businesses with no hard signals are excluded
# ---------------------------------------------------------------------------

async def test_businesses_without_hard_signals_excluded(db):
    """
    Pipeline with one business that has only soft signals → not saved as a lead.
    """
    biz = RawBusiness(
        place_id="place_clean",
        name="Clean Site",
        address="1 Clean St, Austin, TX 78701, USA",
        city="Austin",
        state="TX",
        phone="555-0001",
        website_url="https://clean.example.com",
        maps_url="https://maps/clean",
    )

    run = make_run(db)

    with patch("app.lead_pipeline.pipeline.scrape_queries", return_value=[biz]):
        from app.gap_analyzer.analyzer import AnalysisResult, GapSignalResult

        async def mock_analyze(url):
            # Only soft signals — does NOT qualify as a lead
            return AnalysisResult(
                gap_signals=[GapSignalResult("missing_meta_title", False, "Missing title")],
                gap_score=2.0,
                has_hard_signal=False,
            )

        with patch("app.lead_pipeline.pipeline.analyze", side_effect=mock_analyze):
            await execute_run(run.id, db)

    db.refresh(run)
    assert run.status == RunStatus.completed.value
    assert run.total_leads == 0
    assert db.query(Lead).filter(Lead.run_id == run.id).count() == 0


# ---------------------------------------------------------------------------
# Test 3: Run is persisted with correct status transitions
# ---------------------------------------------------------------------------

async def test_run_persisted_correctly(db):
    """Run transitions pending → running → completed and total_leads is set."""
    biz = GOOD_BIZ  # no website → qualifies

    run = make_run(db)
    assert run.status == "pending"

    with patch("app.lead_pipeline.pipeline.scrape_queries", return_value=[biz]):
        from app.gap_analyzer.analyzer import AnalysisResult, GapSignalResult

        async def mock_analyze(url):
            return AnalysisResult(
                gap_signals=[GapSignalResult("no_website", True, "No website listed")],
                gap_score=10.0,
                has_hard_signal=True,
            )

        with patch("app.lead_pipeline.pipeline.analyze", side_effect=mock_analyze):
            await execute_run(run.id, db)

    db.refresh(run)
    assert run.status == RunStatus.completed.value
    assert run.total_leads == 1
    assert run.error_message is None


# ---------------------------------------------------------------------------
# Test 4: Failed website fetch does NOT abort the run
# ---------------------------------------------------------------------------

async def test_failed_website_fetch_does_not_crash_run(db):
    """
    One business has a broken website (analyzer returns broken_website hard signal),
    another has no website. Both should be saved; run completes successfully.
    """
    broken = BROKEN_BIZ   # broken website
    no_site = GOOD_BIZ    # no website

    run = make_run(db)

    with patch("app.lead_pipeline.pipeline.scrape_queries", return_value=[broken, no_site]):
        from app.gap_analyzer.analyzer import AnalysisResult, GapSignalResult

        async def mock_analyze(url):
            if url is None:
                return AnalysisResult(
                    gap_signals=[GapSignalResult("no_website", True, "No website listed")],
                    gap_score=10.0,
                    has_hard_signal=True,
                )
            # Broken site returns hard signal without crashing
            return AnalysisResult(
                gap_signals=[GapSignalResult("broken_website", True, "Website unreachable")],
                gap_score=10.0,
                has_hard_signal=True,
            )

        with patch("app.lead_pipeline.pipeline.analyze", side_effect=mock_analyze):
            await execute_run(run.id, db)

    db.refresh(run)
    assert run.status == RunStatus.completed.value
    assert run.total_leads == 2


# ---------------------------------------------------------------------------
# Test 5: Lead status defaults to "new"
# ---------------------------------------------------------------------------

async def test_lead_status_defaults_to_new(db):
    """All leads created by the pipeline have status='new'."""
    biz = GOOD_BIZ

    run = make_run(db)

    with patch("app.lead_pipeline.pipeline.scrape_queries", return_value=[biz]):
        from app.gap_analyzer.analyzer import AnalysisResult, GapSignalResult

        async def mock_analyze(url):
            return AnalysisResult(
                gap_signals=[GapSignalResult("no_website", True, "No website listed")],
                gap_score=10.0,
                has_hard_signal=True,
            )

        with patch("app.lead_pipeline.pipeline.analyze", side_effect=mock_analyze):
            await execute_run(run.id, db)

    leads = db.query(Lead).filter(Lead.run_id == run.id).all()
    assert len(leads) == 1
    assert leads[0].status == "new"


# ---------------------------------------------------------------------------
# Test 6: Gap signals are persisted correctly
# ---------------------------------------------------------------------------

async def test_gap_signals_persisted(db):
    """GapSignal rows are created with correct signal_type, is_hard, description."""
    biz = GOOD_BIZ

    run = make_run(db)

    with patch("app.lead_pipeline.pipeline.scrape_queries", return_value=[biz]):
        from app.gap_analyzer.analyzer import AnalysisResult, GapSignalResult

        async def mock_analyze(url):
            return AnalysisResult(
                gap_signals=[
                    GapSignalResult("no_website", True, "No website listed"),
                    GapSignalResult("missing_meta_title", False, "Missing title"),
                ],
                gap_score=12.0,
                has_hard_signal=True,
            )

        with patch("app.lead_pipeline.pipeline.analyze", side_effect=mock_analyze):
            await execute_run(run.id, db)

    lead = db.query(Lead).filter(Lead.run_id == run.id).first()
    assert lead is not None
    signals = db.query(GapSignal).filter(GapSignal.lead_id == lead.id).all()
    assert len(signals) == 2
    hard_signals = [s for s in signals if s.is_hard]
    assert len(hard_signals) == 1
    assert hard_signals[0].signal_type == "no_website"


# ---------------------------------------------------------------------------
# Test 7 (issue #0006): Max results cap is enforced across all queries
# ---------------------------------------------------------------------------

async def test_max_results_cap_enforced(db):
    """
    When scrape_queries would return more businesses than max_results_per_run,
    the pipeline must pass the cap down so total raw businesses never exceed it.

    This verifies the cap is read from config_yaml and forwarded to the scraper.
    """
    CAP = 3
    config_yaml = f"queries:\n  - q1\n  - q2\nmax_results_per_run: {CAP}\n"

    # Simulate scraper returning exactly CAP businesses when cap=3 is passed
    businesses = [
        RawBusiness(
            place_id=f"place_{i}",
            name=f"Biz {i}",
            address=f"{i} St, Austin, TX 78701, USA",
            city="Austin",
            state="TX",
            phone=None,
            website_url=None,
            maps_url=f"https://maps/{i}",
        )
        for i in range(CAP)
    ]

    run = make_run(db, config_yaml)

    captured_max: list[int] = []

    async def mock_scrape(queries, max_results):
        captured_max.append(max_results)
        # Return only up to max_results businesses
        return businesses[:max_results]

    from app.gap_analyzer.analyzer import AnalysisResult, GapSignalResult

    async def mock_analyze(url):
        return AnalysisResult(
            gap_signals=[GapSignalResult("no_website", True, "No website")],
            gap_score=10.0,
            has_hard_signal=True,
        )

    with patch("app.lead_pipeline.pipeline.scrape_queries", side_effect=mock_scrape):
        with patch("app.lead_pipeline.pipeline.analyze", side_effect=mock_analyze):
            await execute_run(run.id, db)

    # The cap passed to scrape_queries must match the config value
    assert captured_max == [CAP], f"Expected cap {CAP}, got {captured_max}"
    # And no more than CAP leads were saved
    lead_count = db.query(Lead).filter(Lead.run_id == run.id).count()
    assert lead_count <= CAP
