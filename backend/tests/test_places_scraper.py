"""Tests for the places scraper module."""

import re
import pytest
import httpx
from unittest.mock import patch
from pytest_httpx import HTTPXMock

from app.places_scraper.scraper import scrape_queries, RawBusiness

# Use regex patterns so query-string params don't break URL matching
TEXT_SEARCH_RE = re.compile(r"https://maps\.googleapis\.com/maps/api/place/textsearch/json.*")
DETAILS_RE = re.compile(r"https://maps\.googleapis\.com/maps/api/place/details/json.*")

# ---------------------------------------------------------------------------
# Helpers / fixtures
# ---------------------------------------------------------------------------

PLACE_ID_1 = "ChIJ_place_001"
PLACE_ID_2 = "ChIJ_place_002"


def text_search_response(place_ids: list[str], next_page_token: str | None = None) -> dict:
    """Build a realistic Text Search API response."""
    results = []
    for i, pid in enumerate(place_ids):
        results.append(
            {
                "place_id": pid,
                "name": f"Business {i + 1}",
                "formatted_address": "123 Main St, Springfield, IL 62701, USA",
            }
        )
    body: dict = {"status": "OK", "results": results}
    if next_page_token:
        body["next_page_token"] = next_page_token
    return body


def details_response(phone: str | None = "(555) 123-4567", website: str | None = "https://example.com") -> dict:
    """Build a realistic Details API response."""
    result: dict = {}
    if phone:
        result["formatted_phone_number"] = phone
    if website:
        result["website"] = website
    return {"result": result}


# ---------------------------------------------------------------------------
# Cycle 1: Single query, successful result — correct fields
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_single_query_returns_raw_businesses(httpx_mock: HTTPXMock):
    """scrape_queries with one query returns a list of RawBusiness with correct fields."""
    with patch("app.config.settings.GOOGLE_PLACES_API_KEY", "test-key"):
        httpx_mock.add_response(
            method="GET",
            url=TEXT_SEARCH_RE,
            json=text_search_response([PLACE_ID_1]),
        )
        httpx_mock.add_response(
            method="GET",
            url=DETAILS_RE,
            json=details_response(),
        )

        results = await scrape_queries(["plumbers in Springfield IL"])

    assert len(results) == 1
    biz = results[0]
    assert isinstance(biz, RawBusiness)
    assert biz.external_id == PLACE_ID_1
    assert biz.name == "Business 1"
    assert biz.address == "123 Main St, Springfield, IL 62701, USA"
    assert biz.city == "Springfield"
    assert biz.state == "IL"
    assert biz.phone == "(555) 123-4567"
    assert biz.website_url == "https://example.com"
    assert biz.maps_url == f"https://www.google.com/maps/place/?q=place_id:{PLACE_ID_1}"


# ---------------------------------------------------------------------------
# Cycle 2: Empty results — ZERO_RESULTS status → returns [], no error
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_zero_results_returns_empty_list(httpx_mock: HTTPXMock):
    """API returns ZERO_RESULTS → scrape_queries returns [] without raising."""
    with patch("app.config.settings.GOOGLE_PLACES_API_KEY", "test-key"):
        httpx_mock.add_response(
            method="GET",
            url=TEXT_SEARCH_RE,
            json={"status": "ZERO_RESULTS", "results": []},
        )

        results = await scrape_queries(["nonexistent place xyz"])

    assert results == []


# ---------------------------------------------------------------------------
# Cycle 3: Result cap — max_results=2 with 3 available → exactly 2 returned
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_result_cap_limits_output(httpx_mock: HTTPXMock):
    """max_results=2 with 3 API results → only 2 RawBusiness objects returned."""
    with patch("app.config.settings.GOOGLE_PLACES_API_KEY", "test-key"):
        httpx_mock.add_response(
            method="GET",
            url=TEXT_SEARCH_RE,
            json=text_search_response([PLACE_ID_1, PLACE_ID_2, "ChIJ_place_003"]),
        )
        # Two details calls (one per result up to cap)
        httpx_mock.add_response(method="GET", url=DETAILS_RE, json=details_response())
        httpx_mock.add_response(method="GET", url=DETAILS_RE, json=details_response())

        results = await scrape_queries(["plumbers in Springfield IL"], max_results=2)

    assert len(results) == 2


# ---------------------------------------------------------------------------
# Cycle 4: API error status — REQUEST_DENIED → returns [], no exception
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_api_error_status_returns_empty_list(httpx_mock: HTTPXMock):
    """API returns REQUEST_DENIED → scrape_queries returns [] without raising."""
    with patch("app.config.settings.GOOGLE_PLACES_API_KEY", "test-key"):
        httpx_mock.add_response(
            method="GET",
            url=TEXT_SEARCH_RE,
            json={"status": "REQUEST_DENIED"},
        )

        results = await scrape_queries(["plumbers in Springfield IL"])

    assert results == []


# ---------------------------------------------------------------------------
# Cycle 5: Network failure — ConnectError → returns [], no exception
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_network_failure_returns_empty_list(httpx_mock: HTTPXMock):
    """ConnectError on text search → scrape_queries returns [] without raising."""
    with patch("app.config.settings.GOOGLE_PLACES_API_KEY", "test-key"):
        httpx_mock.add_exception(
            httpx.ConnectError("fail"),
            url=TEXT_SEARCH_RE,
        )

        results = await scrape_queries(["plumbers in Springfield IL"])

    assert results == []


# ---------------------------------------------------------------------------
# Cycle 6: Deduplication — same place_id from two queries appears only once
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_deduplication_across_queries(httpx_mock: HTTPXMock):
    """Same place_id returned from two queries → appears only once in output."""
    with patch("app.config.settings.GOOGLE_PLACES_API_KEY", "test-key"):
        # First query returns PLACE_ID_1
        httpx_mock.add_response(method="GET", url=TEXT_SEARCH_RE, json=text_search_response([PLACE_ID_1]))
        httpx_mock.add_response(method="GET", url=DETAILS_RE, json=details_response())
        # Second query also returns PLACE_ID_1 (duplicate)
        httpx_mock.add_response(method="GET", url=TEXT_SEARCH_RE, json=text_search_response([PLACE_ID_1]))
        httpx_mock.add_response(method="GET", url=DETAILS_RE, json=details_response())

        results = await scrape_queries(["query one", "query two"])

    assert len(results) == 1
    assert results[0].external_id == PLACE_ID_1


# ---------------------------------------------------------------------------
# Issue #0017: RawBusiness uses external_id instead of place_id
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_raw_business_has_external_id_field(httpx_mock: HTTPXMock):
    """RawBusiness.external_id replaces place_id — field name is external_id."""
    with patch("app.config.settings.GOOGLE_PLACES_API_KEY", "test-key"):
        httpx_mock.add_response(
            method="GET",
            url=TEXT_SEARCH_RE,
            json=text_search_response([PLACE_ID_1]),
        )
        httpx_mock.add_response(
            method="GET",
            url=DETAILS_RE,
            json=details_response(),
        )

        results = await scrape_queries(["plumbers in Springfield IL"])

    assert len(results) == 1
    biz = results[0]
    assert biz.external_id == PLACE_ID_1
    assert not hasattr(biz, "place_id"), "place_id field should no longer exist on RawBusiness"


def test_default_max_results_is_10():
    """DEFAULT_MAX_RESULTS_PER_RUN constant must be 10 (changed from 500 in #0017)."""
    from app.config import DEFAULT_MAX_RESULTS_PER_RUN

    assert DEFAULT_MAX_RESULTS_PER_RUN == 10
