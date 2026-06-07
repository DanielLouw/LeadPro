"""
Lead-source adapter implementations and the adapter registry.

Adding a new source means:
1. Implement the LeadSource Protocol in a new class.
2. Add it to ADAPTER_REGISTRY with the matching source key.
"""

from collections.abc import Awaitable, Callable

from app.places_scraper.scraper import RawBusiness, scrape_queries as _places_scrape_queries


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
    ) -> list[RawBusiness]:
        scrape = _scrape_fn if _scrape_fn is not None else _places_scrape_queries
        queries: list[str] = source_config.get("queries") or legacy_queries or []
        return await scrape(queries, max_results)


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

ADAPTER_REGISTRY: dict[str, GooglePlacesAdapter | _NotImplementedAdapter] = {
    "google_places": GooglePlacesAdapter(),
    "apify_google_maps": _NotImplementedAdapter("apify_google_maps"),
    "apify_facebook_pages": _NotImplementedAdapter("apify_facebook_pages"),
}
