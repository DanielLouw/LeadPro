"""
Budget estimation and monthly spend tracking for LeadPro (issue #0021).

All functions are pure (estimate_run_cost) or DB-read-only (get_monthly_spend).
No HTTP calls are made.
"""

import math
from datetime import date

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Run

# ---------------------------------------------------------------------------
# Rate constants
# ---------------------------------------------------------------------------

GOOGLE_PLACES_COST_PER_PAGE = 0.032  # per page of 20 results
APIFY_GOOGLE_MAPS_COST_PER_RESULT = 0.004
APIFY_FACEBOOK_PAGES_COST_PER_RESULT = 0.010

# Sources that belong to the 'apify' budget group
_APIFY_SOURCES = ("apify_google_maps", "apify_facebook_pages")


def estimate_run_cost(source: str, max_results: int) -> float:
    """Return the estimated USD cost for a run with the given source and result count.

    Rates:
    - google_places:        ceil(max_results / 20) * 0.032
    - apify_google_maps:    max_results * 0.004
    - apify_facebook_pages: max_results * 0.010
    """
    if source == "google_places":
        pages = math.ceil(max_results / 20)
        return pages * GOOGLE_PLACES_COST_PER_PAGE
    if source == "apify_google_maps":
        return max_results * APIFY_GOOGLE_MAPS_COST_PER_RESULT
    if source == "apify_facebook_pages":
        return max_results * APIFY_FACEBOOK_PAGES_COST_PER_RESULT
    raise ValueError(f"Unknown source: {source!r}")


def get_monthly_spend(db: Session, source_group: str, month: date) -> float:
    """Return the total cost_usd for all runs in the given source group and calendar month.

    source_group values:
    - 'google_places' — only runs with source='google_places'
    - 'apify'         — runs with source in ('apify_google_maps', 'apify_facebook_pages')

    Runs with NULL cost_usd are counted as 0.
    """
    # Compute the first and last day of the month
    month_start = date(month.year, month.month, 1)
    if month.month == 12:
        month_end = date(month.year + 1, 1, 1)
    else:
        month_end = date(month.year, month.month + 1, 1)

    query = db.query(func.coalesce(func.sum(Run.cost_usd), 0.0)).filter(
        Run.created_at >= month_start,
        Run.created_at < month_end,
    )

    if source_group == "google_places":
        query = query.filter(Run.source == "google_places")
    elif source_group == "apify":
        query = query.filter(Run.source.in_(_APIFY_SOURCES))
    else:
        raise ValueError(f"Unknown source_group: {source_group!r}")

    result = query.scalar()
    return float(result) if result is not None else 0.0
