"""
Lead pipeline: orchestrates scraping + gap analysis for a single Run.

Input:  a Search Config (YAML string) + a run_id already persisted in the DB
Output: persisted Lead rows ranked by gap_score DESC

Only businesses with at least one hard gap signal are saved as Leads.
"""

import asyncio
import logging
from typing import Callable

import yaml
from sqlalchemy.orm import Session

from app.config import DEFAULT_MAX_RESULTS_PER_RUN
from app.gap_analyzer.analyzer import analyze
from app.lead_pipeline.adapters import ADAPTER_REGISTRY
from app.models import GapSignal, Lead, Note, Run, RunStatus
from app.places_scraper.scraper import RawBusiness, scrape_queries

logger = logging.getLogger(__name__)

# Concurrency cap for website analysis to avoid hammering targets
_ANALYSIS_CONCURRENCY = 10


async def execute_run(run_id: int, db: Session) -> None:
    """Run the full pipeline for a given run_id. Updates run status on completion."""
    run: Run | None = db.get(Run, run_id)
    if run is None:
        raise ValueError(f"Run {run_id} not found")

    config = yaml.safe_load(run.config_yaml)

    # ------------------------------------------------------------------
    # Shared config keys
    # ------------------------------------------------------------------
    max_results: int = config.get("max_results_per_run", DEFAULT_MAX_RESULTS_PER_RUN)

    # ------------------------------------------------------------------
    # Source resolution
    # ------------------------------------------------------------------
    # run.source is the canonical source (set when the Run row is created).
    # Fall back to 'google_places' for legacy rows that predate the column.
    source: str = run.source or "google_places"
    adapter = ADAPTER_REGISTRY[source]

    # source_config block — present in new YAML shape; absent in legacy YAML.
    source_config: dict = config.get("source_config") or {}

    # Legacy YAML has top-level "queries"; new YAML puts them inside source_config.
    legacy_queries: list[str] = config.get("queries", [])

    run.status = RunStatus.running.value
    run.queries_completed = 0
    db.commit()

    try:
        raw_businesses = await adapter.fetch(
            source_config=source_config,
            max_results=max_results,
            legacy_queries=legacy_queries,
            _scrape_fn=scrape_queries,
            db=db,
            run_id=run_id,
        )

        # Update total now that we know how many businesses to analyse
        run = db.get(Run, run_id)
        run.queries_total = len(raw_businesses)
        db.commit()

        leads = await _analyze_businesses(
            raw_businesses,
            on_query_complete=lambda completed: _update_progress(db, run_id, completed),
        )

        for lead_data in leads:
            lead = Lead(
                run_id=run_id,
                external_id=lead_data["external_id"],
                name=lead_data["name"],
                phone=lead_data["phone"],
                address=lead_data["address"],
                city=lead_data["city"],
                state=lead_data["state"],
                email=lead_data["email"],
                website_url=lead_data["website_url"],
                maps_url=lead_data["maps_url"],
                gap_score=lead_data["gap_score"],
                status="new",
            )
            db.add(lead)
            db.flush()

            for sig in lead_data["gap_signals"]:
                db.add(
                    GapSignal(
                        lead_id=lead.id,
                        signal_type=sig["signal_type"],
                        is_hard=sig["is_hard"],
                        description=sig["description"],
                    )
                )
            db.add(Note(lead_id=lead.id, content=""))

        run = db.get(Run, run_id)  # re-fetch after potential progress commits
        run.total_leads = len(leads)
        run.queries_completed = run.queries_total
        run.status = RunStatus.completed.value

        run.cost_usd = adapter.cost(len(raw_businesses))

        db.commit()

    except Exception as exc:
        logger.exception("Run %d failed", run_id)
        db.rollback()  # discard any partial leads flushed before the failure
        run = db.get(Run, run_id)
        run.status = RunStatus.failed.value
        run.error_message = str(exc)
        try:
            db.commit()
        except Exception:
            logger.exception("Run %d: could not persist failed status", run_id)
        raise


def _update_progress(db: Session, run_id: int, queries_completed: int) -> None:
    """Persist incremental progress to the run row so polling clients can see it."""
    try:
        run = db.get(Run, run_id)
        if run:
            run.queries_completed = queries_completed
            db.commit()
    except Exception:
        logger.warning("Run %d: failed to update progress counter", run_id)


async def _analyze_businesses(
    raw: list[RawBusiness],
    on_query_complete: Callable[[int], None] | None = None,
) -> list[dict]:
    """Analyze all businesses concurrently, returning only those with hard gap signals."""
    semaphore = asyncio.Semaphore(_ANALYSIS_CONCURRENCY)
    completed_count = 0

    async def analyze_one(biz: RawBusiness) -> dict | None:
        nonlocal completed_count
        async with semaphore:
            result = await analyze(biz.website_url)
        completed_count += 1
        if on_query_complete:
            on_query_complete(completed_count)
        if not result.qualifies_as_lead():
            return None
        return {
            "external_id": biz.external_id,
            "name": biz.name,
            "phone": biz.phone,
            "address": biz.address,
            "city": biz.city,
            "state": biz.state,
            "email": None,
            "website_url": biz.website_url,
            "maps_url": biz.maps_url,
            "gap_score": result.gap_score,
            "gap_signals": [
                {
                    "signal_type": s.signal_type,
                    "is_hard": s.is_hard,
                    "description": s.description,
                }
                for s in result.gap_signals
            ],
        }

    tasks = [analyze_one(biz) for biz in raw]
    raw_results = await asyncio.gather(*tasks, return_exceptions=True)
    leads = []
    for r in raw_results:
        if isinstance(r, BaseException):
            logger.warning("Business analysis failed, skipping: %s", r)
        elif r is not None:
            leads.append(r)
    leads.sort(key=lambda x: x["gap_score"], reverse=True)
    return leads
