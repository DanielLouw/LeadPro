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


# ---------------------------------------------------------------------------
# Feature: business_status filter — permanently closed places are excluded
# ---------------------------------------------------------------------------


def details_response_with_status(
    phone: str | None = "(555) 123-4567",
    website: str | None = "https://example.com",
    business_status: str | None = None,
) -> dict:
    """Build a Details API response that may include business_status."""
    result: dict = {}
    if phone:
        result["formatted_phone_number"] = phone
    if website:
        result["website"] = website
    if business_status is not None:
        result["business_status"] = business_status
    return {"result": result}


@pytest.mark.asyncio
async def test_permanently_closed_place_excluded(httpx_mock: HTTPXMock):
    """Place with business_status 'PERMANENTLY_CLOSED' is not returned in results."""
    with patch("app.config.settings.GOOGLE_PLACES_API_KEY", "test-key"):
        httpx_mock.add_response(
            method="GET",
            url=TEXT_SEARCH_RE,
            json=text_search_response([PLACE_ID_1]),
        )
        httpx_mock.add_response(
            method="GET",
            url=DETAILS_RE,
            json=details_response_with_status(business_status="PERMANENTLY_CLOSED"),
        )

        results = await scrape_queries(["plumbers in Springfield IL"])

    assert results == []


@pytest.mark.asyncio
async def test_closed_permanently_variant_excluded(httpx_mock: HTTPXMock):
    """Place with business_status 'CLOSED_PERMANENTLY' is also excluded (legacy variant)."""
    with patch("app.config.settings.GOOGLE_PLACES_API_KEY", "test-key"):
        httpx_mock.add_response(
            method="GET",
            url=TEXT_SEARCH_RE,
            json=text_search_response([PLACE_ID_1]),
        )
        httpx_mock.add_response(
            method="GET",
            url=DETAILS_RE,
            json=details_response_with_status(business_status="CLOSED_PERMANENTLY"),
        )

        results = await scrape_queries(["plumbers in Springfield IL"])

    assert results == []


@pytest.mark.asyncio
async def test_operational_place_included(httpx_mock: HTTPXMock):
    """Place with business_status 'OPERATIONAL' is returned normally."""
    with patch("app.config.settings.GOOGLE_PLACES_API_KEY", "test-key"):
        httpx_mock.add_response(
            method="GET",
            url=TEXT_SEARCH_RE,
            json=text_search_response([PLACE_ID_1]),
        )
        httpx_mock.add_response(
            method="GET",
            url=DETAILS_RE,
            json=details_response_with_status(business_status="OPERATIONAL"),
        )

        results = await scrape_queries(["plumbers in Springfield IL"])

    assert len(results) == 1
    assert results[0].external_id == PLACE_ID_1


@pytest.mark.asyncio
async def test_missing_business_status_included(httpx_mock: HTTPXMock):
    """Place without business_status field in details is included (safe default)."""
    with patch("app.config.settings.GOOGLE_PLACES_API_KEY", "test-key"):
        httpx_mock.add_response(
            method="GET",
            url=TEXT_SEARCH_RE,
            json=text_search_response([PLACE_ID_1]),
        )
        httpx_mock.add_response(
            method="GET",
            url=DETAILS_RE,
            json=details_response(),  # no business_status
        )

        results = await scrape_queries(["plumbers in Springfield IL"])

    assert len(results) == 1
    assert results[0].external_id == PLACE_ID_1


def details_response_with_reviews(
    phone: str | None = "(555) 123-4567",
    website: str | None = "https://example.com",
    rating: float | None = None,
    user_ratings_total: int | None = None,
) -> dict:
    """Build a Details API response that may include rating/user_ratings_total."""
    result: dict = {}
    if phone:
        result["formatted_phone_number"] = phone
    if website:
        result["website"] = website
    if rating is not None:
        result["rating"] = rating
    if user_ratings_total is not None:
        result["user_ratings_total"] = user_ratings_total
    return {"result": result}


@pytest.mark.asyncio
async def test_details_request_asks_for_rating_and_review_fields(httpx_mock: HTTPXMock):
    """The outgoing Details request's `fields` param must actually include
    rating/user_ratings_total — a URL-pattern-only mock would still pass even if
    a future edit silently dropped these from the request, so this checks the
    real outgoing query params instead of just the mocked response shape."""
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

        await scrape_queries(["plumbers in Springfield IL"])

    details_requests = [r for r in httpx_mock.get_requests() if "details/json" in str(r.url)]
    assert len(details_requests) == 1
    fields_param = details_requests[0].url.params.get("fields")
    assert "rating" in fields_param.split(",")
    assert "user_ratings_total" in fields_param.split(",")


@pytest.mark.asyncio
async def test_business_with_ten_reviews_included_and_populated(httpx_mock: HTTPXMock):
    """Place with 10 reviews (the inclusive floor) is included, with rating/review_count
    populated onto RawBusiness from the Details API response."""
    with patch("app.config.settings.GOOGLE_PLACES_API_KEY", "test-key"):
        httpx_mock.add_response(
            method="GET",
            url=TEXT_SEARCH_RE,
            json=text_search_response([PLACE_ID_1]),
        )
        httpx_mock.add_response(
            method="GET",
            url=DETAILS_RE,
            json=details_response_with_reviews(rating=4.2, user_ratings_total=10),
        )

        results = await scrape_queries(["plumbers in Springfield IL"])

    assert len(results) == 1
    assert results[0].review_count == 10
    assert results[0].rating == 4.2


@pytest.mark.asyncio
async def test_business_with_nine_reviews_excluded(httpx_mock: HTTPXMock):
    """Place with fewer than 10 reviews is dropped before gap analysis."""
    with patch("app.config.settings.GOOGLE_PLACES_API_KEY", "test-key"):
        httpx_mock.add_response(
            method="GET",
            url=TEXT_SEARCH_RE,
            json=text_search_response([PLACE_ID_1]),
        )
        httpx_mock.add_response(
            method="GET",
            url=DETAILS_RE,
            json=details_response_with_reviews(user_ratings_total=9),
        )

        results = await scrape_queries(["plumbers in Springfield IL"])

    assert results == []


@pytest.mark.asyncio
async def test_business_with_unknown_review_count_included(httpx_mock: HTTPXMock):
    """Place with no user_ratings_total field in the Details response is included
    (unknown review count is not treated as an exclusion — safe default, same as
    the missing business_status case)."""
    with patch("app.config.settings.GOOGLE_PLACES_API_KEY", "test-key"):
        httpx_mock.add_response(
            method="GET",
            url=TEXT_SEARCH_RE,
            json=text_search_response([PLACE_ID_1]),
        )
        httpx_mock.add_response(
            method="GET",
            url=DETAILS_RE,
            json=details_response(),  # no rating / user_ratings_total
        )

        results = await scrape_queries(["plumbers in Springfield IL"])

    assert len(results) == 1
    assert results[0].review_count is None


@pytest.mark.asyncio
async def test_closed_place_does_not_block_open_places(httpx_mock: HTTPXMock):
    """Closed place is skipped while open places in the same query are still returned."""
    with patch("app.config.settings.GOOGLE_PLACES_API_KEY", "test-key"):
        httpx_mock.add_response(
            method="GET",
            url=TEXT_SEARCH_RE,
            json=text_search_response([PLACE_ID_1, PLACE_ID_2]),
        )
        # First place is permanently closed
        httpx_mock.add_response(
            method="GET",
            url=DETAILS_RE,
            json=details_response_with_status(business_status="PERMANENTLY_CLOSED"),
        )
        # Second place is operational
        httpx_mock.add_response(
            method="GET",
            url=DETAILS_RE,
            json=details_response_with_status(business_status="OPERATIONAL"),
        )

        results = await scrape_queries(["plumbers in Springfield IL"])

    assert len(results) == 1
    assert results[0].external_id == PLACE_ID_2
