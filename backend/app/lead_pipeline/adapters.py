"""
Lead-source adapter implementations and the adapter registry.

Adding a new source means:
1. Implement the LeadSource Protocol in a new class.
2. Add it to ADAPTER_REGISTRY with the matching source key.
"""

import asyncio
import logging
import math
from collections.abc import Awaitable, Callable
from typing import Any

import httpx

from app.config import (
    APIFY_API_BASE_URL,
    APIFY_FACEBOOK_PAGES_COST_PER_LEAD,
    APIFY_GOOGLE_MAPS_COST_PER_LEAD,
    PLACES_COST_PER_1000_REQUESTS,
    PLACES_RESULTS_PER_REQUEST,
    settings,
)
from app.models import Run
from app.places_scraper.scraper import RawBusiness, scrape_queries as _places_scrape_queries

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------

class ConfigurationError(Exception):
    """Raised when a required configuration value is missing."""


# ---------------------------------------------------------------------------
# Shared Apify constants
# ---------------------------------------------------------------------------

_APIFY_TERMINAL_STATUSES = frozenset({"SUCCEEDED", "FAILED", "TIMED-OUT", "ABORTED"})
_APIFY_FAILURE_STATUSES = frozenset({"FAILED", "TIMED-OUT", "ABORTED"})
_DEFAULT_POLL_INTERVAL = 10.0

_FACEBOOK_PAGES_ACTOR_ID = "apify~facebook-pages-scraper"

_STATUS_QUEUED = "Queued on Apify"
_STATUS_RUNNING = "Apify is scraping — this usually takes 1–3 minutes"
_STATUS_DOWNLOADING = "Downloading results"


class GooglePlacesAdapter:
    """
    Wraps the ``scrape_queries`` Google Places scraper.

    New YAML shape (``source_config`` block present)::

        source: google_places
        max_results_per_run: 10
        source_config:
          queries:
            - plumbers in Austin TX

    Legacy YAML (no ``source_config`` block): ``legacy_queries`` is passed
    as the fallback by ``execute_run()``.

    The optional ``_scrape_fn`` parameter allows callers (and tests) to
    substitute a different implementation of the scraper at call time.
    When omitted, the real ``scrape_queries`` function is used.
    """

    async def fetch(
        self,
        source_config: dict,
        max_results: int,
        *,
        legacy_queries: list[str] | None = None,
        _scrape_fn: Callable[..., Awaitable[list[RawBusiness]]] | None = None,
        **_kwargs: Any,
    ) -> list[RawBusiness]:
        scrape = _scrape_fn if _scrape_fn is not None else _places_scrape_queries
        queries: list[str] = source_config.get("queries") or legacy_queries or []
        return await scrape(queries, max_results)

    def cost(self, n_scraped: int) -> float:
        return math.ceil(n_scraped / PLACES_RESULTS_PER_REQUEST) * (PLACES_COST_PER_1000_REQUESTS / 1000)


class ApifyGoogleMapsAdapter:
    """
    Fetches business records from the Apify ``compass/crawler-google-places`` actor.

    YAML shape::

        source: apify_google_maps
        max_results_per_run: 10
        source_config:
          search_term: plumbers
          city: Austin
          state: TX

    The optional ``_apify_client`` parameter allows tests to inject a mock
    client instead of hitting the real Apify API.  When omitted, the real
    ``ApifyClient`` (from the ``apify-client`` package) is used.

    The optional ``db`` and ``run_id`` parameters allow the adapter to write
    ``apify_run_id`` and ``apify_status`` progress back to the DB row during
    the run.  Both must be provided together; if either is absent, DB writes
    are skipped silently.

    ``legacy_queries`` is accepted for Protocol compatibility but is not used —
    Apify runs are always driven by ``source_config``.
    """

    async def fetch(
        self,
        source_config: dict,
        max_results: int,
        *,
        legacy_queries: list[str] | None = None,
        _apify_client=None,
        _poll_interval: float = _DEFAULT_POLL_INTERVAL,
        db=None,
        run_id: int | None = None,
        **_kwargs: Any,
    ) -> list[RawBusiness]:
        if not settings.APIFY_API_KEY:
            raise ConfigurationError(
                "APIFY_API_KEY is not configured. "
                "Set the APIFY_API_KEY environment variable before running an Apify-sourced run."
            )

        if _apify_client is None:
            from apify_client import ApifyClient
            client = ApifyClient(settings.APIFY_API_KEY)
        else:
            client = _apify_client

        search_term = source_config.get("search_term", "")
        city = source_config.get("city", "")
        state = source_config.get("state", "")
        query = f"{search_term} in {city} {state}".strip()

        actor_input = {
            "searchStringsArray": [query],
            "maxCrawledPlacesPerSearch": max_results,
        }

        run_info = await asyncio.to_thread(
            lambda: client.actor("compass/crawler-google-places").start(run_input=actor_input)
        )
        apify_run_id: str = run_info["id"]
        dataset_id: str = run_info["defaultDatasetId"]

        self._update_db(db, run_id, apify_run_id=apify_run_id, apify_status=_STATUS_QUEUED)

        seen_running = False
        status = ""
        while True:
            if _poll_interval > 0:
                await asyncio.sleep(_poll_interval)

            run_data = await asyncio.to_thread(client.run(apify_run_id).get)
            status = run_data.get("status", "")

            if status == "RUNNING" and not seen_running:
                seen_running = True
                self._update_db(db, run_id, apify_status=_STATUS_RUNNING)

            if status in _APIFY_TERMINAL_STATUSES:
                break

        if status in _APIFY_FAILURE_STATUSES:
            raise RuntimeError(
                f"Apify actor run {apify_run_id!r} ended with terminal status: {status}"
            )

        self._update_db(db, run_id, apify_status=_STATUS_DOWNLOADING)

        items_response = await asyncio.to_thread(client.dataset(dataset_id).list_items)
        raw_items: list[dict] = items_response.items

        results: list[RawBusiness] = []
        for item in raw_items:
            try:
                place_id = item.get("placeId")
                if not place_id:
                    logger.warning("Apify item missing placeId — skipping: %r", item)
                    continue
                results.append(
                    RawBusiness(
                        external_id=place_id,
                        name=item.get("title") or "",
                        address=item.get("address"),
                        city=item.get("city"),
                        state=item.get("state"),
                        phone=item.get("phoneUnformatted"),
                        website_url=item.get("website"),
                        maps_url=item.get("url"),
                    )
                )
            except Exception:
                logger.warning("Failed to map Apify item to RawBusiness — skipping: %r", item)

        return results[:max_results]

    def cost(self, n_scraped: int) -> float:
        return n_scraped * APIFY_GOOGLE_MAPS_COST_PER_LEAD

    def _update_db(self, db, run_id: int | None, **fields) -> None:
        """Write ``fields`` to the Run row. Silently no-ops if db/run_id absent."""
        if db is None or run_id is None:
            return
        try:
            run = db.get(Run, run_id)
            if run is not None:
                for key, value in fields.items():
                    setattr(run, key, value)
                db.commit()
        except Exception:
            logger.warning("ApifyGoogleMapsAdapter: failed to update run %s in DB", run_id)


class ApifyFacebookPagesAdapter:
    """
    Fetches leads from Facebook Pages via the Apify ``apify/facebook-pages-scraper``
    actor.

    YAML shape::

        source: apify_facebook_pages
        max_results_per_run: 10
        source_config:
          query: plumbers Austin Texas

    The adapter starts the Apify actor via the REST API, polls for completion,
    then maps the dataset items to ``RawBusiness`` records.

    Pages missing both ``phone`` and ``website_url`` are skipped — they carry
    no actionable lead data.

    The optional ``_http_client`` parameter lets tests inject a mock
    ``httpx.AsyncClient`` to avoid real network calls.  ``_poll_interval``
    (seconds) allows tests to suppress the asyncio sleep.
    """

    async def fetch(
        self,
        source_config: dict,
        max_results: int,
        *,
        legacy_queries: list[str] | None = None,
        _http_client: Any | None = None,
        _poll_interval: float = _DEFAULT_POLL_INTERVAL,
        **_kwargs: Any,
    ) -> list[RawBusiness]:
        if not settings.APIFY_API_KEY:
            raise ConfigurationError(
                "APIFY_API_KEY is not configured. "
                "Set the APIFY_API_KEY environment variable before running an Apify-sourced run."
            )

        query: str = source_config.get("query", "")

        async def _run(client: httpx.AsyncClient) -> list[RawBusiness]:
            run_url = f"{APIFY_API_BASE_URL}/acts/{_FACEBOOK_PAGES_ACTOR_ID}/runs"
            post_resp = await client.post(
                run_url,
                params={"token": settings.APIFY_API_KEY},
                json={"queries": [query], "maxResults": max_results},
            )
            post_resp.raise_for_status()
            run_data = post_resp.json()["data"]
            run_id: str = run_data["id"]
            dataset_id: str = run_data["defaultDatasetId"]

            status_url = f"{APIFY_API_BASE_URL}/acts/{_FACEBOOK_PAGES_ACTOR_ID}/runs/{run_id}"
            while True:
                status_resp = await client.get(
                    status_url,
                    params={"token": settings.APIFY_API_KEY},
                )
                status_resp.raise_for_status()
                status = status_resp.json()["data"]["status"]
                if status in _APIFY_TERMINAL_STATUSES:
                    break
                if _poll_interval > 0:
                    await asyncio.sleep(_poll_interval)

            if status != "SUCCEEDED":
                raise RuntimeError(f"Apify Facebook Pages actor run {run_id} ended with status {status!r}")

            dataset_url = f"{APIFY_API_BASE_URL}/datasets/{dataset_id}/items"
            dataset_resp = await client.get(
                dataset_url,
                params={"token": settings.APIFY_API_KEY},
            )
            dataset_resp.raise_for_status()
            items: list[dict] = dataset_resp.json()

            results: list[RawBusiness] = []
            for item in items:
                if len(results) >= max_results:
                    break
                phone: str | None = item.get("phone") or None
                website_url: str | None = item.get("website") or None
                if phone is None and website_url is None:
                    logger.debug("Skipping Facebook page %r — no phone or website", item.get("id"))
                    continue
                results.append(
                    RawBusiness(
                        external_id=str(item["id"]),
                        name=item.get("title", ""),
                        phone=phone,
                        website_url=website_url,
                        address=item.get("address") or None,
                        city=item.get("city") or None,
                        state=item.get("state") or None,
                        maps_url=None,
                    )
                )
            return results

        if _http_client is not None:
            return await _run(_http_client)

        async with httpx.AsyncClient(timeout=30.0) as client:
            return await _run(client)

    def cost(self, n_scraped: int) -> float:
        return n_scraped * APIFY_FACEBOOK_PAGES_COST_PER_LEAD


class _NotImplementedAdapter:
    """Placeholder for sources not yet implemented."""

    def __init__(self, name: str) -> None:
        self._name = name

    async def fetch(
        self,
        source_config: dict,
        max_results: int,
        *,
        legacy_queries: list[str] | None = None,
        _scrape_fn: Callable[..., Awaitable[list[RawBusiness]]] | None = None,
    ) -> list[RawBusiness]:
        raise NotImplementedError(f"Adapter for '{self._name}' is not yet implemented")


# ---------------------------------------------------------------------------
# Registry — pipeline looks up adapters by run.source
# ---------------------------------------------------------------------------

ADAPTER_REGISTRY: dict[str, GooglePlacesAdapter | ApifyGoogleMapsAdapter | ApifyFacebookPagesAdapter | _NotImplementedAdapter] = {
    "google_places": GooglePlacesAdapter(),
    "apify_google_maps": ApifyGoogleMapsAdapter(),
    "apify_facebook_pages": ApifyFacebookPagesAdapter(),
}
