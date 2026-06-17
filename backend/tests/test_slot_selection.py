"""
Unit tests for select_and_initialize_slots (issue #16).

Uses an in-memory SQLite database — same pattern as test_lead_pipeline.py.
"""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool

from app.models import Base, SearchSlot, Run
from app.pipeline.slot_selection import select_and_initialize_slots


# ---------------------------------------------------------------------------
# Fixtures
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


def make_run(db: Session) -> Run:
    run = Run(config_yaml="queries: []\n", status="completed", total_leads=0)
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


# ---------------------------------------------------------------------------
# Test 1 (tracer bullet): slots are created on first call
# ---------------------------------------------------------------------------

def test_slots_created_on_first_call(db):
    """
    First call for a state+industry should populate search_slots with all
    (county, search_term) combinations and return n of them.
    """
    slots = select_and_initialize_slots(db, state="TX", industry="plumbers", n=3)

    assert len(slots) == 3
    # All returned slots should be for TX / plumbers
    for slot in slots:
        assert slot.state == "TX"
        assert slot.industry == "plumbers"

    # The DB should contain many more rows than 3
    total = db.query(SearchSlot).filter_by(state="TX", industry="plumbers").count()
    assert total > 3


# ---------------------------------------------------------------------------
# Test 2: exactly n slots returned
# ---------------------------------------------------------------------------

def test_returns_exactly_n_slots(db):
    """The function returns exactly n slots when enough combinations exist."""
    slots_2 = select_and_initialize_slots(db, state="DE", industry="plumbers", n=2)
    assert len(slots_2) == 2

    slots_5 = select_and_initialize_slots(db, state="HI", industry="plumbers", n=5)
    assert len(slots_5) == 5


# ---------------------------------------------------------------------------
# Test 3: unvisited slots (search_count=0) are preferred over visited ones
# ---------------------------------------------------------------------------

def test_unvisited_slots_preferred(db):
    """
    After seeding slots and manually bumping search_count on some, the next
    call should return the ones with count=0 before the ones with count>0.
    """
    # Initialise all slots for DE / plumbers (DE has only 3 counties)
    all_slots = select_and_initialize_slots(db, state="DE", industry="plumbers", n=3)
    assert len(all_slots) == 3

    # Mark 2 of the 3 slots as visited
    for slot in all_slots[:2]:
        slot.search_count = 5
    db.commit()

    # Ask for 2 slots — should get the 1 unvisited one plus 1 of the visited
    result = select_and_initialize_slots(db, state="DE", industry="plumbers", n=2)
    counts = [s.search_count for s in result]
    assert counts[0] == 0, "Lowest search_count slot must come first"


# ---------------------------------------------------------------------------
# Test 4: NULL last_run_id rows come before non-NULL when counts are equal
# ---------------------------------------------------------------------------

def test_null_last_run_id_comes_first(db):
    """
    When search_count is tied, NULL last_run_id rows are returned before
    rows that have a last_run_id.
    """
    # Initialise DE / plumbers (3 counties × search terms)
    select_and_initialize_slots(db, state="DE", industry="plumbers", n=3)

    run = make_run(db)

    # Set all slots to search_count=1, but give some a last_run_id and some NULL
    all_slots = db.query(SearchSlot).filter_by(state="DE", industry="plumbers").all()
    for i, slot in enumerate(all_slots):
        slot.search_count = 1
        slot.last_run_id = run.id if i % 2 == 0 else None
    db.commit()

    # Count how many have NULL vs non-NULL last_run_id
    null_count = sum(1 for s in all_slots if s.last_run_id is None)
    assert null_count > 0, "Test setup: need at least one NULL last_run_id slot"

    result = select_and_initialize_slots(db, state="DE", industry="plumbers", n=null_count)
    # All returned slots should have NULL last_run_id
    for slot in result:
        assert slot.last_run_id is None, "NULL last_run_id slots should come first when counts are equal"


# ---------------------------------------------------------------------------
# Test 5: subsequent calls do not duplicate rows
# ---------------------------------------------------------------------------

def test_subsequent_calls_do_not_duplicate_rows(db):
    """Calling twice with the same arguments must not create duplicate DB rows."""
    select_and_initialize_slots(db, state="HI", industry="plumbers", n=3)
    count_after_first = db.query(SearchSlot).filter_by(state="HI", industry="plumbers").count()

    select_and_initialize_slots(db, state="HI", industry="plumbers", n=3)
    count_after_second = db.query(SearchSlot).filter_by(state="HI", industry="plumbers").count()

    assert count_after_first == count_after_second, "Second call must not insert duplicate rows"


# ---------------------------------------------------------------------------
# Test 6: different state/industry combinations do not cross-contaminate
# ---------------------------------------------------------------------------

def test_different_state_does_not_contaminate(db):
    """Slots returned for TX must all be TX; HI call must return only HI slots."""
    tx_slots = select_and_initialize_slots(db, state="TX", industry="plumbers", n=3)
    hi_slots = select_and_initialize_slots(db, state="HI", industry="plumbers", n=3)

    assert all(s.state == "TX" for s in tx_slots)
    assert all(s.state == "HI" for s in hi_slots)


def test_different_industry_does_not_contaminate(db):
    """Slots for 'plumbers' must not include 'electricians' rows."""
    plumber_slots = select_and_initialize_slots(db, state="DE", industry="plumbers", n=3)
    elec_slots = select_and_initialize_slots(db, state="DE", industry="electricians", n=3)

    assert all(s.industry == "plumbers" for s in plumber_slots)
    assert all(s.industry == "electricians" for s in elec_slots)


# ---------------------------------------------------------------------------
# Test 7: readable validation errors for unknown state / industry
# ---------------------------------------------------------------------------

def test_unknown_state_raises_value_error(db):
    """An unrecognised state abbreviation raises ValueError with the state name."""
    with pytest.raises(ValueError, match="Unknown state"):
        select_and_initialize_slots(db, state="XX", industry="plumbers", n=1)


def test_unknown_industry_raises_value_error(db):
    """An unrecognised industry raises ValueError with the industry name."""
    with pytest.raises(ValueError, match="Unknown industry"):
        select_and_initialize_slots(db, state="TX", industry="wizards", n=1)
