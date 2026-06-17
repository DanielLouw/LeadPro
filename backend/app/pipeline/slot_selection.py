"""
Geographic cycling: slot selection and initialisation.

`select_and_initialize_slots` is the core function for the cycling algorithm.
It upserts all (state, county, industry, search_term) combinations for the
given state+industry pair, then returns the n slots with the lowest
search_count, preferring unvisited slots (NULL last_run_id) when counts tie.
"""

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.data.counties import COUNTIES
from app.data.search_terms import SEARCH_TERMS
from app.models import SearchSlot


def select_and_initialize_slots(
    db: Session,
    state: str,
    industry: str,
    n: int,
) -> list[SearchSlot]:
    """Upsert all slots for state+industry, then return the n lowest-priority ones.

    Priority order (ascending):
      1. search_count (lowest first)
      2. last_run_id IS NULL DESC (NULL = unvisited, comes first)
      3. last_run_id ASC (oldest run visited first)

    The function does NOT increment search_count — that is the caller's job
    after a successful run.

    Args:
        db: Active SQLAlchemy session.
        state: Two-letter US state abbreviation, e.g. ``"TX"``.
        industry: Business type label matching SEARCH_TERMS keys, e.g. ``"plumbers"``.
        n: Maximum number of slots to return.

    Returns:
        List of up to n SearchSlot ORM objects.

    Raises:
        ValueError: If state is not in COUNTIES or industry is not in SEARCH_TERMS.
    """
    if state not in COUNTIES:
        raise ValueError(f"Unknown state: {state!r}")
    if industry not in SEARCH_TERMS:
        raise ValueError(f"Unknown industry: {industry!r}")

    counties = COUNTIES[state]
    search_terms = SEARCH_TERMS[industry]

    # ------------------------------------------------------------------
    # Upsert: INSERT all combinations, skip duplicates silently.
    # SQLite and PostgreSQL both support ON CONFLICT DO NOTHING.
    # ------------------------------------------------------------------
    rows = [
        {"state": state, "county": county, "industry": industry, "search_term": term}
        for county in counties
        for term in search_terms
    ]

    _INSERT_SQL = text(
        "INSERT INTO search_slots (state, county, industry, search_term, search_count)"
        " VALUES (:state, :county, :industry, :search_term, 0)"
        " ON CONFLICT DO NOTHING"
    )
    _CHUNK_SIZE = 1_000
    for i in range(0, len(rows), _CHUNK_SIZE):
        db.execute(_INSERT_SQL, rows[i : i + _CHUNK_SIZE])
    db.commit()

    # ------------------------------------------------------------------
    # SELECT the n lowest-priority slots.
    # ------------------------------------------------------------------
    slots = (
        db.query(SearchSlot)
        .filter_by(state=state, industry=industry)
        .order_by(
            SearchSlot.search_count.asc(),
            SearchSlot.last_run_id.is_(None).desc(),
            SearchSlot.last_run_id.asc(),
        )
        .limit(n)
        .all()
    )
    return slots
