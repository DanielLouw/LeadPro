"""
LeadSource Protocol — the contract every lead-source adapter must satisfy.

Each adapter wraps one external data source (Google Places, Apify Google Maps,
Apify Facebook Pages, …) and exposes a single async method that the pipeline
calls to obtain raw business records.
"""

from typing import Protocol

from app.places_scraper.scraper import RawBusiness


class LeadSource(Protocol):
    """
    Contract for lead-source adapters.

    Implementors wrap a single external data source and translate its raw
    API/scraper output into a list of ``RawBusiness`` records that the
    pipeline can analyse.
    """

    async def fetch(
        self,
        source_config: dict,
        max_results: int,
        *,
        legacy_queries: list[str] | None = None,
    ) -> list[RawBusiness]:
        """
        Fetch raw business records from the underlying source.

        Parameters
        ----------
        source_config:
            The ``source_config`` block parsed from the run's ``config_yaml``.
            Adapters should read their query parameters from here.
        max_results:
            Hard cap on the total number of records to return.
        legacy_queries:
            Fallback query list for runs whose ``config_yaml`` predates the
            ``source_config`` block.  Adapters should use this when
            ``source_config`` contains no ``queries`` key.
        """
        ...
