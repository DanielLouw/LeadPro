"""
Unit tests for ApifyFacebookPagesAdapter (issue #0020).

All tests inject a mock HTTP client via ``_http_client`` parameter to avoid
real network calls and decouple tests from implementation details.
"""

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.lead_pipeline.adapters import ADAPTER_REGISTRY, ApifyFacebookPagesAdapter
from app.places_scraper.scraper import RawBusiness


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_http_client(run_response: dict, status_responses: list[dict], dataset_items: list[dict]) -> MagicMock:
    """
    Build a mock httpx.AsyncClient that responds to:
    1. POST /acts/.../runs  → run_response
    2. GET  /acts/.../runs/{id}  (multiple times) → status_responses (in order)
    3. GET  /datasets/{datasetId}/items → dataset_items
    """
    client = MagicMock()

    # POST to start the run
    post_resp = MagicMock()
    post_resp.raise_for_status = MagicMock()
    post_resp.json = MagicMock(return_value=run_response)
    client.post = AsyncMock(return_value=post_resp)

    # GET calls: first N status polls, then dataset fetch
    get_responses = []
    for s in status_responses:
        r = MagicMock()
        r.raise_for_status = MagicMock()
        r.json = MagicMock(return_value=s)
        get_responses.append(r)

    dataset_resp = MagicMock()
    dataset_resp.raise_for_status = MagicMock()
    dataset_resp.json = MagicMock(return_value=dataset_items)
    get_responses.append(dataset_resp)

    client.get = AsyncMock(side_effect=get_responses)
    return client


FACEBOOK_PAGE_ITEM = {
    "id": "fb_page_001",
    "title": "Austin Plumbers Co",
    "phone": "+1-512-555-0001",
    "website": "https://austinplumbers.com",
    "address": "123 Main St",
    "city": "Austin",
    "state": "TX",
}

RUN_STARTED = {
    "data": {
        "id": "apify_run_abc123",
        "status": "RUNNING",
        "defaultDatasetId": "dataset_xyz",
    }
}

RUN_SUCCEEDED = {
    "data": {
        "id": "apify_run_abc123",
        "status": "SUCCEEDED",
        "defaultDatasetId": "dataset_xyz",
    }
}


# ---------------------------------------------------------------------------
# Cycle 1: fetch() maps actor output fields to RawBusiness correctly
# ---------------------------------------------------------------------------

async def test_fetch_maps_facebook_page_fields_to_raw_business():
    """
    Given a Facebook page item with all fields populated,
    fetch() must map them to RawBusiness with the correct field assignments.
    """
    client = _make_http_client(
        run_response=RUN_STARTED,
        status_responses=[RUN_SUCCEEDED],
        dataset_items=[FACEBOOK_PAGE_ITEM],
    )

    adapter = ApifyFacebookPagesAdapter()
    results = await adapter.fetch(
        source_config={"query": "plumbers Austin Texas"},
        max_results=10,
        _http_client=client,
    )

    assert len(results) == 1
    biz = results[0]
    assert biz.external_id == "fb_page_001"
    assert biz.name == "Austin Plumbers Co"
    assert biz.phone == "+1-512-555-0001"
    assert biz.website_url == "https://austinplumbers.com"
    assert biz.address == "123 Main St"
    assert biz.city == "Austin"
    assert biz.state == "TX"


# ---------------------------------------------------------------------------
# Cycle 2: maps_url is always None for Facebook sources
# ---------------------------------------------------------------------------

async def test_fetch_sets_maps_url_to_none():
    """
    RawBusiness records from Facebook Pages must have maps_url = None
    since there is no Google Maps equivalent.
    """
    client = _make_http_client(
        run_response=RUN_STARTED,
        status_responses=[RUN_SUCCEEDED],
        dataset_items=[FACEBOOK_PAGE_ITEM],
    )

    adapter = ApifyFacebookPagesAdapter()
    results = await adapter.fetch(
        source_config={"query": "plumbers Austin Texas"},
        max_results=10,
        _http_client=client,
    )

    assert len(results) == 1
    assert results[0].maps_url is None


# ---------------------------------------------------------------------------
# Cycle 3: pages with no phone AND no website are skipped
# ---------------------------------------------------------------------------

async def test_fetch_skips_pages_with_no_phone_and_no_website():
    """
    Pages that have neither phone nor website_url contain no useful lead data
    and must be excluded from the output.
    """
    no_contact_page = {
        "id": "fb_page_no_contact",
        "title": "Ghost Business",
        "phone": None,
        "website": None,
        "address": "456 Elm St",
        "city": "Austin",
        "state": "TX",
    }
    page_with_phone_only = {
        "id": "fb_page_phone_only",
        "title": "Phone-Only Plumber",
        "phone": "+1-512-555-0002",
        "website": None,
        "address": "789 Oak St",
        "city": "Austin",
        "state": "TX",
    }
    client = _make_http_client(
        run_response=RUN_STARTED,
        status_responses=[RUN_SUCCEEDED],
        dataset_items=[no_contact_page, page_with_phone_only],
    )

    adapter = ApifyFacebookPagesAdapter()
    results = await adapter.fetch(
        source_config={"query": "plumbers Austin Texas"},
        max_results=10,
        _http_client=client,
    )

    assert len(results) == 1
    assert results[0].external_id == "fb_page_phone_only"


# ---------------------------------------------------------------------------
# Cycle 4: fetch() starts the correct Apify actor with the right input
# ---------------------------------------------------------------------------

async def test_fetch_starts_correct_apify_actor():
    """
    fetch() must POST to the apify/facebook-pages-scraper actor endpoint
    and include the query from source_config in the actor input.
    """
    client = _make_http_client(
        run_response=RUN_STARTED,
        status_responses=[RUN_SUCCEEDED],
        dataset_items=[FACEBOOK_PAGE_ITEM],
    )

    adapter = ApifyFacebookPagesAdapter()
    await adapter.fetch(
        source_config={"query": "plumbers Austin Texas"},
        max_results=5,
        _http_client=client,
    )

    post_call = client.post.call_args
    url = post_call.args[0] if post_call.args else post_call.kwargs.get("url", "")
    assert "apify~facebook-pages-scraper" in url or "apify/facebook-pages-scraper" in url

    # The actor input must include the query
    body = post_call.kwargs.get("json", {})
    assert "plumbers Austin Texas" in str(body)


# ---------------------------------------------------------------------------
# Cycle 5: adapter is registered in ADAPTER_REGISTRY under apify_facebook_pages
# ---------------------------------------------------------------------------

def test_adapter_registry_contains_apify_facebook_pages():
    """
    ADAPTER_REGISTRY must map 'apify_facebook_pages' to an
    ApifyFacebookPagesAdapter instance (not the _NotImplementedAdapter stub).
    """
    assert "apify_facebook_pages" in ADAPTER_REGISTRY
    assert isinstance(ADAPTER_REGISTRY["apify_facebook_pages"], ApifyFacebookPagesAdapter)


# ---------------------------------------------------------------------------
# Cycle 6: fetch() handles polling — transitions RUNNING→SUCCEEDED
# ---------------------------------------------------------------------------

async def test_fetch_polls_until_succeeded():
    """
    When the first status poll returns RUNNING and the second returns SUCCEEDED,
    fetch() must wait and then fetch the dataset.
    """
    client = _make_http_client(
        run_response=RUN_STARTED,
        status_responses=[
            {"data": {"id": "apify_run_abc123", "status": "RUNNING", "defaultDatasetId": "dataset_xyz"}},
            RUN_SUCCEEDED,
        ],
        dataset_items=[FACEBOOK_PAGE_ITEM],
    )

    adapter = ApifyFacebookPagesAdapter()
    results = await adapter.fetch(
        source_config={"query": "plumbers Austin Texas"},
        max_results=10,
        _http_client=client,
        _poll_interval=0,  # no sleep in tests
    )

    # Dataset was fetched and result was mapped correctly
    assert len(results) == 1
    assert results[0].external_id == "fb_page_001"


# ---------------------------------------------------------------------------
# Cycle 7: fetch() respects max_results cap
# ---------------------------------------------------------------------------

async def test_fetch_respects_max_results_cap():
    """
    fetch() must return at most max_results records even when the actor
    returns more items.
    """
    items = [
        {
            "id": f"fb_page_{i:03d}",
            "title": f"Plumber {i}",
            "phone": f"+1-512-555-{i:04d}",
            "website": None,
            "address": None,
            "city": None,
            "state": None,
        }
        for i in range(20)
    ]
    client = _make_http_client(
        run_response=RUN_STARTED,
        status_responses=[RUN_SUCCEEDED],
        dataset_items=items,
    )

    adapter = ApifyFacebookPagesAdapter()
    results = await adapter.fetch(
        source_config={"query": "plumbers Austin Texas"},
        max_results=5,
        _http_client=client,
    )

    assert len(results) == 5


# ---------------------------------------------------------------------------
# Cycle 8: _apify_api_key kwarg is forwarded in the POST request token
# ---------------------------------------------------------------------------

async def test_fetch_uses_injected_api_key_in_request():
    """
    When _apify_api_key is passed, fetch() must include it as the token
    query parameter in the POST request (not the value from settings).
    """
    from unittest.mock import patch

    client = _make_http_client(
        run_response=RUN_STARTED,
        status_responses=[RUN_SUCCEEDED],
        dataset_items=[FACEBOOK_PAGE_ITEM],
    )

    adapter = ApifyFacebookPagesAdapter()

    with patch("app.lead_pipeline.adapters.settings") as mock_settings:
        mock_settings.APIFY_API_KEY = "env_key_should_not_be_used"
        await adapter.fetch(
            source_config={"query": "plumbers Austin Texas"},
            max_results=10,
            _http_client=client,
            _apify_api_key="injected_key",
            _poll_interval=0,
        )

    # The POST call should have used the injected key, not the env key
    post_call_kwargs = client.post.call_args
    assert post_call_kwargs.kwargs["params"]["token"] == "injected_key"
