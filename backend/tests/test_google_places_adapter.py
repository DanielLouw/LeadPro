"""
Unit tests for GooglePlacesAdapter (issue #0018).

Adapter tests inject a mock scrape function via the ``_scrape_fn`` parameter
rather than patching module-level names — this keeps tests decoupled from
import aliases and focuses on observable behaviour.
"""

from unittest.mock import AsyncMock

from app.lead_pipeline.adapters import GooglePlacesAdapter, ADAPTER_REGISTRY
from app.places_scraper.scraper import RawBusiness


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_raw_business(external_id: str, name: str = "Test Biz") -> RawBusiness:
    return RawBusiness(
        external_id=external_id,
        name=name,
        address="1 Main St, Austin, TX 78701, USA",
        city="Austin",
        state="TX",
        phone="(512) 555-0001",
        website_url=None,
        maps_url=f"https://www.google.com/maps/place/?q=place_id:{external_id}",
    )


# ---------------------------------------------------------------------------
# Cycle 1: fetch() returns RawBusiness records with external_id from placeId
# ---------------------------------------------------------------------------

async def test_fetch_returns_raw_businesses_with_external_id():
    """
    Given scrape_queries returns businesses with external_ids,
    GooglePlacesAdapter.fetch() must return them with external_id preserved.
    """
    expected = [
        make_raw_business("ChIJplace001", "Plumber A"),
        make_raw_business("ChIJplace002", "Plumber B"),
    ]
    adapter = GooglePlacesAdapter()
    source_config = {"queries": ["plumbers in Austin TX"]}
    mock_scrape = AsyncMock(return_value=expected)

    results = await adapter.fetch(
        source_config=source_config,
        max_results=10,
        _scrape_fn=mock_scrape,
    )

    assert len(results) == 2
    assert results[0].external_id == "ChIJplace001"
    assert results[1].external_id == "ChIJplace002"


# ---------------------------------------------------------------------------
# Cycle 2: fetch() reads queries from source_config
# ---------------------------------------------------------------------------

async def test_fetch_passes_source_config_queries_to_scraper():
    """
    fetch() must pass source_config['queries'] to the scrape function.
    """
    adapter = GooglePlacesAdapter()
    source_config = {"queries": ["electricians in Dallas TX", "plumbers in Houston TX"]}

    captured_queries: list[list[str]] = []

    async def mock_scrape(queries, max_results):
        captured_queries.append(list(queries))
        return []

    await adapter.fetch(
        source_config=source_config,
        max_results=5,
        _scrape_fn=mock_scrape,
    )

    assert captured_queries == [["electricians in Dallas TX", "plumbers in Houston TX"]]


# ---------------------------------------------------------------------------
# Cycle 3: fetch() passes max_results to the scraper
# ---------------------------------------------------------------------------

async def test_fetch_passes_max_results_to_scraper():
    """fetch() must forward max_results to the scrape function."""
    adapter = GooglePlacesAdapter()
    source_config = {"queries": ["plumbers in Austin TX"]}

    captured_max: list[int] = []

    async def mock_scrape(queries, max_results):
        captured_max.append(max_results)
        return []

    await adapter.fetch(
        source_config=source_config,
        max_results=42,
        _scrape_fn=mock_scrape,
    )

    assert captured_max == [42]


# ---------------------------------------------------------------------------
# Cycle 4: fetch() falls back to legacy_queries when source_config has none
# ---------------------------------------------------------------------------

async def test_fetch_falls_back_to_legacy_queries_when_source_config_has_none():
    """
    When source_config has no 'queries' key and legacy_queries is provided,
    fetch() must use legacy_queries.
    """
    adapter = GooglePlacesAdapter()
    source_config: dict = {}
    legacy_queries = ["hvac in Memphis TN"]

    captured_queries: list[list[str]] = []

    async def mock_scrape(queries, max_results):
        captured_queries.append(list(queries))
        return []

    await adapter.fetch(
        source_config=source_config,
        max_results=10,
        legacy_queries=legacy_queries,
        _scrape_fn=mock_scrape,
    )

    assert captured_queries == [["hvac in Memphis TN"]]


# ---------------------------------------------------------------------------
# Cycle 5: Adapter registry contains google_places key
# ---------------------------------------------------------------------------

def test_adapter_registry_contains_google_places():
    """The adapter registry must map 'google_places' to a GooglePlacesAdapter."""
    assert "google_places" in ADAPTER_REGISTRY
    assert isinstance(ADAPTER_REGISTRY["google_places"], GooglePlacesAdapter)
