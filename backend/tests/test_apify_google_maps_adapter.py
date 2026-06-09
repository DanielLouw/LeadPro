"""
Unit tests for ApifyGoogleMapsAdapter (issue #0019).

All Apify API calls are injected via the ``_apify_client`` parameter so tests
never touch the network.  The client is a plain object with methods matching
the apify-client SDK interface (duck-typed).
"""

import pytest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.lead_pipeline.adapters import ApifyGoogleMapsAdapter, ADAPTER_REGISTRY
from app.places_scraper.scraper import RawBusiness


# ---------------------------------------------------------------------------
# Helpers / fixtures
# ---------------------------------------------------------------------------

def make_apify_item(
    place_id: str = "ChIJmock001",
    title: str = "Test Plumber",
    address: str = "123 Main St, Austin, TX 78701",
    city: str = "Austin",
    state: str = "TX",
    phone: str = "(512) 555-0001",
    website: str = "https://example.com",
    url: str = "https://www.google.com/maps/place/?q=place_id:ChIJmock001",
) -> dict:
    """Return a dict that mirrors an Apify compass/crawler-google-places item."""
    return {
        "placeId": place_id,
        "title": title,
        "address": address,
        "city": city,
        "state": state,
        "phoneUnformatted": phone,
        "website": website,
        "url": url,
    }


def make_apify_client(
    run_id: str = "apify_run_abc",
    dataset_id: str = "dataset_xyz",
    items: list[dict] | None = None,
    terminal_status: str = "SUCCEEDED",
    poll_sequence: list[str] | None = None,
) -> MagicMock:
    """
    Build a mock apify-client that simulates: start → poll → dataset fetch.

    ``poll_sequence`` — list of statuses returned by successive calls to
    ``run_client.get()``.  Defaults to [RUNNING, SUCCEEDED].
    """
    if items is None:
        items = [make_apify_item()]
    if poll_sequence is None:
        poll_sequence = ["RUNNING", terminal_status]

    actor_client = MagicMock()
    actor_client.start.return_value = SimpleNamespace(
        id=run_id,
        default_dataset_id=dataset_id,
        status="READY",
    )

    # Build sequential poll responses
    poll_iter = iter(poll_sequence)

    def _get_run():
        status = next(poll_iter, terminal_status)
        return SimpleNamespace(id=run_id, default_dataset_id=dataset_id, status=status)

    run_client = MagicMock()
    run_client.get = MagicMock(side_effect=lambda: _get_run())

    # Dataset items
    dataset_client = MagicMock()
    dataset_client.list_items.return_value = MagicMock(items=items)

    client = MagicMock()
    client.actor.return_value = actor_client
    client.run.return_value = run_client
    client.dataset.return_value = dataset_client

    return client


# ---------------------------------------------------------------------------
# Cycle 1: fetch() returns RawBusiness records with external_id from placeId
# ---------------------------------------------------------------------------

async def test_fetch_returns_raw_businesses_with_external_id_from_place_id():
    """
    Given mocked Apify responses (start → RUNNING → SUCCEEDED → dataset items),
    fetch() must return RawBusiness records with external_id == item['placeId'].
    """
    items = [
        make_apify_item(place_id="ChIJmock001", title="Plumber A"),
        make_apify_item(place_id="ChIJmock002", title="Plumber B"),
    ]
    mock_client = make_apify_client(items=items)

    adapter = ApifyGoogleMapsAdapter()
    source_config = {"search_term": "plumbers", "city": "Austin", "state": "TX"}

    with patch("app.lead_pipeline.adapters.settings") as mock_settings:
        mock_settings.APIFY_API_KEY = "test_key"
        results = await adapter.fetch(
            source_config=source_config,
            max_results=10,
            _apify_client=mock_client,
            _poll_interval=0,
        )

    assert len(results) == 2
    assert all(isinstance(r, RawBusiness) for r in results)
    assert results[0].external_id == "ChIJmock001"
    assert results[1].external_id == "ChIJmock002"


# ---------------------------------------------------------------------------
# Cycle 2: fetch() builds query from search_term, city, state
# ---------------------------------------------------------------------------

async def test_fetch_starts_apify_actor_with_correct_input():
    """
    fetch() must start the Apify actor with an input dict derived from
    source_config (search_term, city, state) and max_results.
    """
    mock_client = make_apify_client()

    adapter = ApifyGoogleMapsAdapter()
    source_config = {"search_term": "electricians", "city": "Dallas", "state": "TX"}

    with patch("app.lead_pipeline.adapters.settings") as mock_settings:
        mock_settings.APIFY_API_KEY = "test_key"
        await adapter.fetch(
            source_config=source_config,
            max_results=5,
            _apify_client=mock_client,
            _poll_interval=0,
        )

    mock_client.actor.assert_called_once_with("compass/crawler-google-places")
    call_kwargs = mock_client.actor.return_value.start.call_args
    actor_input = call_kwargs.kwargs.get("run_input") or call_kwargs.args[0]
    assert actor_input["searchStringsArray"] == ["electricians in Dallas TX"]
    assert actor_input["maxCrawledPlacesPerSearch"] == 5


# ---------------------------------------------------------------------------
# Cycle 3: fetch() writes run.apify_run_id after actor start
# ---------------------------------------------------------------------------

async def test_fetch_writes_apify_run_id_to_db():
    """
    Immediately after the actor run is created, fetch() must persist
    run.apify_run_id to the DB row.
    """
    mock_client = make_apify_client(run_id="run_write_test")

    adapter = ApifyGoogleMapsAdapter()
    source_config = {"search_term": "plumbers", "city": "Austin", "state": "TX"}

    mock_run = MagicMock()
    mock_db = MagicMock()
    mock_db.get.return_value = mock_run

    with patch("app.lead_pipeline.adapters.settings") as mock_settings:
        mock_settings.APIFY_API_KEY = "test_key"
        await adapter.fetch(
            source_config=source_config,
            max_results=10,
            _apify_client=mock_client,
            _poll_interval=0,
            db=mock_db,
            run_id=1,
        )

    mock_db.get.assert_called()
    mock_db.commit.assert_called()
    run_obj = mock_db.get.return_value
    assert run_obj.apify_run_id == "run_write_test"


# ---------------------------------------------------------------------------
# Cycle 4: fetch() updates apify_status at each polling transition
# ---------------------------------------------------------------------------

async def test_fetch_sets_queued_status_immediately_after_actor_start():
    """
    fetch() must set run.apify_status through all expected transitions:
    - After actor start: "Queued on Apify"
    - When RUNNING: "Apify is scraping — this usually takes 1–3 minutes"
    - When SUCCEEDED (before dataset fetch): "Downloading results"
    """
    mock_client = make_apify_client(poll_sequence=["RUNNING", "SUCCEEDED"])

    adapter = ApifyGoogleMapsAdapter()
    source_config = {"search_term": "plumbers", "city": "Austin", "state": "TX"}

    status_values: list[str] = []
    run_obj = MagicMock()

    # Capture all assignments to apify_status using a PropertyMock approach
    type(run_obj).apify_status = property(
        fget=lambda self: getattr(self, "_apify_status", None),
        fset=lambda self, v: (status_values.append(v), object.__setattr__(self, "_apify_status", v)),
    )

    mock_db = MagicMock()
    mock_db.get.return_value = run_obj

    with patch("app.lead_pipeline.adapters.settings") as mock_settings:
        mock_settings.APIFY_API_KEY = "test_key"
        await adapter.fetch(
            source_config=source_config,
            max_results=10,
            _apify_client=mock_client,
            _poll_interval=0,
            db=mock_db,
            run_id=1,
        )

    assert "Queued on Apify" in status_values
    assert "Apify is scraping — this usually takes 1–3 minutes" in status_values
    assert "Downloading results" in status_values


# ---------------------------------------------------------------------------
# Cycle 5: fetch() raises on terminal Apify failure status
# ---------------------------------------------------------------------------

async def test_fetch_raises_on_terminal_failure_status():
    """
    When Apify returns a terminal failure status (FAILED, TIMED-OUT, ABORTED),
    fetch() must raise an exception containing the status.
    """
    for bad_status in ("FAILED", "TIMED-OUT", "ABORTED"):
        mock_client = make_apify_client(
            terminal_status=bad_status,
            poll_sequence=[bad_status],
        )
        adapter = ApifyGoogleMapsAdapter()
        source_config = {"search_term": "plumbers", "city": "Austin", "state": "TX"}

        with patch("app.lead_pipeline.adapters.settings") as mock_settings:
            mock_settings.APIFY_API_KEY = "test_key"
            with pytest.raises(Exception, match=bad_status):
                await adapter.fetch(
                    source_config=source_config,
                    max_results=10,
                    _apify_client=mock_client,
                    _poll_interval=0,
                )


# ---------------------------------------------------------------------------
# Cycle 6: fetch() skips items with missing/null fields gracefully
# ---------------------------------------------------------------------------

async def test_fetch_skips_items_with_missing_place_id():
    """
    Items missing placeId (or with null placeId) must be skipped, not cause a crash.
    Valid items in the same batch must still be returned.
    """
    items = [
        {"placeId": None, "title": "Bad Item"},  # null placeId → skip
        {},  # entirely empty → skip
        make_apify_item(place_id="ChIJgood001", title="Good Plumber"),
    ]
    mock_client = make_apify_client(items=items)

    adapter = ApifyGoogleMapsAdapter()
    source_config = {"search_term": "plumbers", "city": "Austin", "state": "TX"}

    with patch("app.lead_pipeline.adapters.settings") as mock_settings:
        mock_settings.APIFY_API_KEY = "test_key"
        results = await adapter.fetch(
            source_config=source_config,
            max_results=10,
            _apify_client=mock_client,
            _poll_interval=0,
        )

    assert len(results) == 1
    assert results[0].external_id == "ChIJgood001"


# ---------------------------------------------------------------------------
# Cycle 7: ConfigurationError when APIFY_API_KEY is absent
# ---------------------------------------------------------------------------

async def test_fetch_raises_configuration_error_when_api_key_absent():
    """
    If APIFY_API_KEY is not set (None or empty string), fetch() must raise
    a ConfigurationError before making any API calls.
    """
    from app.lead_pipeline.adapters import ConfigurationError

    adapter = ApifyGoogleMapsAdapter()
    source_config = {"search_term": "plumbers", "city": "Austin", "state": "TX"}

    with patch("app.lead_pipeline.adapters.settings") as mock_settings:
        mock_settings.APIFY_API_KEY = None

        with pytest.raises(ConfigurationError, match="APIFY_API_KEY"):
            await adapter.fetch(
                source_config=source_config,
                max_results=10,
            )


async def test_fetch_raises_configuration_error_when_api_key_empty_string():
    """Empty string APIFY_API_KEY also triggers ConfigurationError."""
    from app.lead_pipeline.adapters import ConfigurationError

    adapter = ApifyGoogleMapsAdapter()
    source_config = {"search_term": "plumbers", "city": "Austin", "state": "TX"}

    with patch("app.lead_pipeline.adapters.settings") as mock_settings:
        mock_settings.APIFY_API_KEY = ""

        with pytest.raises(ConfigurationError, match="APIFY_API_KEY"):
            await adapter.fetch(
                source_config=source_config,
                max_results=10,
            )


# ---------------------------------------------------------------------------
# Cycle 8: apify_google_maps key in ADAPTER_REGISTRY
# ---------------------------------------------------------------------------

def test_adapter_registry_contains_apify_google_maps():
    """The adapter registry must map 'apify_google_maps' to an ApifyGoogleMapsAdapter."""
    assert "apify_google_maps" in ADAPTER_REGISTRY
    assert isinstance(ADAPTER_REGISTRY["apify_google_maps"], ApifyGoogleMapsAdapter)
