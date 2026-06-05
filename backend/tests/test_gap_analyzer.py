"""Tests for gap_analyzer hard and soft signals (issues #0002, #0009)."""

import re
import pytest
import httpx
from unittest.mock import patch

from app.gap_analyzer.analyzer import analyze
from app.config import settings


# ---------------------------------------------------------------------------
# Test 1: no_website — URL is None
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_no_website_none():
    result = await analyze(None)

    assert result.has_hard_signal is True
    assert result.gap_score > 0
    assert len(result.gap_signals) == 1

    signal = result.gap_signals[0]
    assert signal.signal_type == "no_website"
    assert signal.is_hard is True
    assert signal.description  # non-empty string


# ---------------------------------------------------------------------------
# Test 2: no_website — URL is empty string
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_no_website_empty_string():
    result = await analyze("")

    assert result.has_hard_signal is True
    assert result.gap_score > 0

    signal = result.gap_signals[0]
    assert signal.signal_type == "no_website"
    assert signal.is_hard is True


# ---------------------------------------------------------------------------
# Test 3: broken_website — non-2xx HTTP response (404)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_broken_website_non_2xx(httpx_mock):
    httpx_mock.add_response(url="https://example.com", status_code=404)

    result = await analyze("https://example.com")

    assert result.has_hard_signal is True
    assert result.gap_score > 0

    hard_signals = [s for s in result.gap_signals if s.is_hard]
    assert len(hard_signals) == 1
    assert hard_signals[0].signal_type == "broken_website"


# ---------------------------------------------------------------------------
# Test 4: broken_website — connection/network error
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_broken_website_connection_error(httpx_mock):
    httpx_mock.add_exception(httpx.ConnectError("Connection refused"), url="https://broken.example.com")

    result = await analyze("https://broken.example.com")

    assert result.has_hard_signal is True
    assert result.gap_score > 0

    hard_signals = [s for s in result.gap_signals if s.is_hard]
    assert len(hard_signals) == 1
    assert hard_signals[0].signal_type == "broken_website"
    assert hard_signals[0].is_hard is True


# ---------------------------------------------------------------------------
# Test 5: no_https — explicit http:// URL
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_no_https_explicit_http(httpx_mock, no_pagespeed_key):
    httpx_mock.add_response(
        url="http://example.com",
        status_code=200,
        text="<html><head><title>Hello</title><meta name='description' content='desc'><meta name='viewport' content='width=device-width'></head><body></body></html>",
    )
    httpx_mock.add_response(url="http://example.com/sitemap.xml", status_code=200)
    httpx_mock.add_response(url="http://example.com/robots.txt", status_code=200)

    result = await analyze("http://example.com")

    assert result.has_hard_signal is True
    assert result.gap_score > 0

    signal_types = [s.signal_type for s in result.gap_signals]
    assert "no_https" in signal_types

    no_https_signal = next(s for s in result.gap_signals if s.signal_type == "no_https")
    assert no_https_signal.is_hard is True


# ---------------------------------------------------------------------------
# Test 6: low_pagespeed — PageSpeed API returns score < 50
# ---------------------------------------------------------------------------

GOOD_HTML = (
    "<html><head>"
    "<title>Good Site</title>"
    "<meta name='description' content='desc'>"
    "<meta name='viewport' content='width=device-width'>"
    "<script type='application/ld+json'>{}</script>"
    "</head><body></body></html>"
)

PAGESPEED_LOW_RESPONSE = {
    "lighthouseResult": {
        "categories": {
            "performance": {"score": 0.30}
        }
    }
}

PAGESPEED_HIGH_RESPONSE = {
    "lighthouseResult": {
        "categories": {
            "performance": {"score": 0.75}
        }
    }
}


@pytest.mark.asyncio
async def test_low_pagespeed_below_threshold(httpx_mock):
    httpx_mock.add_response(
        url="https://example.com",
        status_code=200,
        text=GOOD_HTML,
    )
    httpx_mock.add_response(url="https://example.com/sitemap.xml", status_code=200)
    httpx_mock.add_response(url="https://example.com/robots.txt", status_code=200)
    httpx_mock.add_response(
        url=re.compile(r"https://www\.googleapis\.com/pagespeedonline/v5/runPagespeed"),
        status_code=200,
        json=PAGESPEED_LOW_RESPONSE,
    )

    with patch.object(settings, "PAGESPEED_API_KEY", "test-key"):
        result = await analyze("https://example.com")

    assert result.has_hard_signal is True
    assert result.gap_score > 0

    pagespeed_signals = [s for s in result.gap_signals if s.signal_type == "low_pagespeed"]
    assert len(pagespeed_signals) == 1
    assert pagespeed_signals[0].is_hard is True


# ---------------------------------------------------------------------------
# Test 7: low_pagespeed absent — PageSpeed API returns score >= 50
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_high_pagespeed_no_signal(httpx_mock):
    httpx_mock.add_response(
        url="https://example.com",
        status_code=200,
        text=GOOD_HTML,
    )
    httpx_mock.add_response(url="https://example.com/sitemap.xml", status_code=200)
    httpx_mock.add_response(url="https://example.com/robots.txt", status_code=200)
    httpx_mock.add_response(
        url=re.compile(r"https://www\.googleapis\.com/pagespeedonline/v5/runPagespeed"),
        status_code=200,
        json=PAGESPEED_HIGH_RESPONSE,
    )

    with patch.object(settings, "PAGESPEED_API_KEY", "test-key"):
        result = await analyze("https://example.com")

    pagespeed_signals = [s for s in result.gap_signals if s.signal_type == "low_pagespeed"]
    assert len(pagespeed_signals) == 0


# ---------------------------------------------------------------------------
# Test 8: PageSpeed API error — exception → graceful (no crash, no signal)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_pagespeed_api_error_graceful(httpx_mock):
    httpx_mock.add_response(
        url="https://example.com",
        status_code=200,
        text=GOOD_HTML,
    )
    httpx_mock.add_response(url="https://example.com/sitemap.xml", status_code=200)
    httpx_mock.add_response(url="https://example.com/robots.txt", status_code=200)
    httpx_mock.add_exception(
        httpx.ConnectError("PageSpeed API unreachable"),
        url=re.compile(r"https://www\.googleapis\.com/pagespeedonline/v5/runPagespeed"),
    )

    with patch.object(settings, "PAGESPEED_API_KEY", "test-key"):
        result = await analyze("https://example.com")

    # Should not crash and should produce no low_pagespeed signal
    pagespeed_signals = [s for s in result.gap_signals if s.signal_type == "low_pagespeed"]
    assert len(pagespeed_signals) == 0


# ---------------------------------------------------------------------------
# Test 8b: PageSpeed API malformed response — no crash, no signal
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_pagespeed_malformed_response_graceful(httpx_mock):
    httpx_mock.add_response(
        url="https://example.com",
        status_code=200,
        text=GOOD_HTML,
    )
    httpx_mock.add_response(url="https://example.com/sitemap.xml", status_code=200)
    httpx_mock.add_response(url="https://example.com/robots.txt", status_code=200)
    httpx_mock.add_response(
        url=re.compile(r"https://www\.googleapis\.com/pagespeedonline/v5/runPagespeed"),
        status_code=200,
        json={"error": "quota exceeded"},  # missing lighthouseResult
    )

    with patch.object(settings, "PAGESPEED_API_KEY", "test-key"):
        result = await analyze("https://example.com")

    pagespeed_signals = [s for s in result.gap_signals if s.signal_type == "low_pagespeed"]
    assert len(pagespeed_signals) == 0


# ---------------------------------------------------------------------------
# Test 9: clean site — no hard signals → has_hard_signal=False, gap_score=0
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_clean_site_no_hard_signals(httpx_mock, no_pagespeed_key):
    httpx_mock.add_response(
        url="https://example.com",
        status_code=200,
        text=GOOD_HTML,
    )
    httpx_mock.add_response(url="https://example.com/sitemap.xml", status_code=200)
    httpx_mock.add_response(url="https://example.com/robots.txt", status_code=200)
    # PAGESPEED_API_KEY patched to empty — pagespeed check skipped

    result = await analyze("https://example.com")

    assert result.has_hard_signal is False
    assert result.gap_score == 0

    hard_signals = [s for s in result.gap_signals if s.is_hard]
    assert len(hard_signals) == 0


# ===========================================================================
# SOFT SIGNAL TESTS (issue #0009)
# ===========================================================================

# ---------------------------------------------------------------------------
# HTML helpers
# ---------------------------------------------------------------------------

BASE_URL = "https://soft.example.com"

# Minimal HTML with ALL soft-signal fields present — no soft signals expected
FULL_HTML = (
    "<html><head>"
    "<title>My Business</title>"
    "<meta name='description' content='We do great things'>"
    "<meta name='viewport' content='width=device-width, initial-scale=1'>"
    "<script type='application/ld+json'>{\"@type\": \"LocalBusiness\"}</script>"
    "</head><body><p>Hello</p></body></html>"
)

# HTML missing meta title
NO_TITLE_HTML = (
    "<html><head>"
    "<meta name='description' content='We do great things'>"
    "<meta name='viewport' content='width=device-width'>"
    "<script type='application/ld+json'>{}</script>"
    "</head><body></body></html>"
)

# HTML with empty title tag
EMPTY_TITLE_HTML = (
    "<html><head>"
    "<title></title>"
    "<meta name='description' content='We do great things'>"
    "<meta name='viewport' content='width=device-width'>"
    "<script type='application/ld+json'>{}</script>"
    "</head><body></body></html>"
)

# HTML missing meta description
NO_DESC_HTML = (
    "<html><head>"
    "<title>My Business</title>"
    "<meta name='viewport' content='width=device-width'>"
    "<script type='application/ld+json'>{}</script>"
    "</head><body></body></html>"
)

# HTML with meta description but empty content
EMPTY_DESC_HTML = (
    "<html><head>"
    "<title>My Business</title>"
    "<meta name='description' content=''>"
    "<meta name='viewport' content='width=device-width'>"
    "<script type='application/ld+json'>{}</script>"
    "</head><body></body></html>"
)

# HTML missing viewport tag
NO_VIEWPORT_HTML = (
    "<html><head>"
    "<title>My Business</title>"
    "<meta name='description' content='We do great things'>"
    "<script type='application/ld+json'>{}</script>"
    "</head><body></body></html>"
)

# HTML missing any schema markup
NO_SCHEMA_HTML = (
    "<html><head>"
    "<title>My Business</title>"
    "<meta name='description' content='We do great things'>"
    "<meta name='viewport' content='width=device-width'>"
    "</head><body></body></html>"
)

# HTML with microdata schema (itemscope) instead of JSON-LD
MICRODATA_HTML = (
    "<html><head>"
    "<title>My Business</title>"
    "<meta name='description' content='We do great things'>"
    "<meta name='viewport' content='width=device-width'>"
    "</head><body>"
    "<div itemscope itemtype='https://schema.org/LocalBusiness'><p>Hello</p></div>"
    "</body></html>"
)

# Malformed HTML — no <head> section at all
NO_HEAD_HTML = "<html><body><p>Just a body, no head tags.</p></body></html>"

# Completely empty HTML
EMPTY_HTML = ""


def _mock_aux(httpx_mock, sitemap_status=200, robots_status=200):
    """Add sitemap.xml and robots.txt mocks."""
    httpx_mock.add_response(url=f"{BASE_URL}/sitemap.xml", status_code=sitemap_status)
    httpx_mock.add_response(url=f"{BASE_URL}/robots.txt", status_code=robots_status)


@pytest.fixture(autouse=False)
def no_pagespeed_key():
    """Patch PAGESPEED_API_KEY to empty so pagespeed check is skipped in soft-signal tests."""
    with patch.object(settings, "PAGESPEED_API_KEY", ""):
        yield


# ---------------------------------------------------------------------------
# Signal 1: missing_meta_title
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_missing_meta_title_detected(httpx_mock, no_pagespeed_key):
    """missing_meta_title signal fired when <title> is absent."""
    httpx_mock.add_response(url=BASE_URL, status_code=200, text=NO_TITLE_HTML)
    _mock_aux(httpx_mock)

    result = await analyze(BASE_URL)

    signal_types = [s.signal_type for s in result.gap_signals]
    assert "missing_meta_title" in signal_types

    sig = next(s for s in result.gap_signals if s.signal_type == "missing_meta_title")
    assert sig.is_hard is False
    assert sig.description  # non-empty plain-English string


@pytest.mark.asyncio
async def test_missing_meta_title_empty_tag(httpx_mock, no_pagespeed_key):
    """missing_meta_title fired when <title> exists but is blank."""
    httpx_mock.add_response(url=BASE_URL, status_code=200, text=EMPTY_TITLE_HTML)
    _mock_aux(httpx_mock)

    result = await analyze(BASE_URL)

    signal_types = [s.signal_type for s in result.gap_signals]
    assert "missing_meta_title" in signal_types


@pytest.mark.asyncio
async def test_missing_meta_title_absent_when_present(httpx_mock, no_pagespeed_key):
    """missing_meta_title NOT fired when <title> is populated."""
    httpx_mock.add_response(url=BASE_URL, status_code=200, text=FULL_HTML)
    _mock_aux(httpx_mock)

    result = await analyze(BASE_URL)

    signal_types = [s.signal_type for s in result.gap_signals]
    assert "missing_meta_title" not in signal_types


# ---------------------------------------------------------------------------
# Signal 2: missing_meta_description
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_missing_meta_description_detected(httpx_mock, no_pagespeed_key):
    """missing_meta_description fired when meta description tag is absent."""
    httpx_mock.add_response(url=BASE_URL, status_code=200, text=NO_DESC_HTML)
    _mock_aux(httpx_mock)

    result = await analyze(BASE_URL)

    signal_types = [s.signal_type for s in result.gap_signals]
    assert "missing_meta_description" in signal_types

    sig = next(s for s in result.gap_signals if s.signal_type == "missing_meta_description")
    assert sig.is_hard is False
    assert sig.description


@pytest.mark.asyncio
async def test_missing_meta_description_empty_content(httpx_mock, no_pagespeed_key):
    """missing_meta_description fired when content attribute is empty."""
    httpx_mock.add_response(url=BASE_URL, status_code=200, text=EMPTY_DESC_HTML)
    _mock_aux(httpx_mock)

    result = await analyze(BASE_URL)

    signal_types = [s.signal_type for s in result.gap_signals]
    assert "missing_meta_description" in signal_types


@pytest.mark.asyncio
async def test_missing_meta_description_absent_when_present(httpx_mock, no_pagespeed_key):
    """missing_meta_description NOT fired when description is populated."""
    httpx_mock.add_response(url=BASE_URL, status_code=200, text=FULL_HTML)
    _mock_aux(httpx_mock)

    result = await analyze(BASE_URL)

    signal_types = [s.signal_type for s in result.gap_signals]
    assert "missing_meta_description" not in signal_types


# ---------------------------------------------------------------------------
# Signal 3: no_sitemap
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_no_sitemap_detected_on_404(httpx_mock, no_pagespeed_key):
    """no_sitemap fired when sitemap.xml returns 404."""
    httpx_mock.add_response(url=BASE_URL, status_code=200, text=FULL_HTML)
    httpx_mock.add_response(url=f"{BASE_URL}/sitemap.xml", status_code=404)
    httpx_mock.add_response(url=f"{BASE_URL}/robots.txt", status_code=200)

    result = await analyze(BASE_URL)

    signal_types = [s.signal_type for s in result.gap_signals]
    assert "no_sitemap" in signal_types

    sig = next(s for s in result.gap_signals if s.signal_type == "no_sitemap")
    assert sig.is_hard is False
    assert sig.description


@pytest.mark.asyncio
async def test_no_sitemap_absent_when_present(httpx_mock, no_pagespeed_key):
    """no_sitemap NOT fired when sitemap.xml returns 200."""
    httpx_mock.add_response(url=BASE_URL, status_code=200, text=FULL_HTML)
    _mock_aux(httpx_mock)

    result = await analyze(BASE_URL)

    signal_types = [s.signal_type for s in result.gap_signals]
    assert "no_sitemap" not in signal_types


@pytest.mark.asyncio
async def test_no_sitemap_on_network_error(httpx_mock, no_pagespeed_key):
    """no_sitemap fired when sitemap.xml is unreachable (network error)."""
    httpx_mock.add_response(url=BASE_URL, status_code=200, text=FULL_HTML)
    httpx_mock.add_exception(
        httpx.ConnectError("timeout"),
        url=f"{BASE_URL}/sitemap.xml",
    )
    httpx_mock.add_response(url=f"{BASE_URL}/robots.txt", status_code=200)

    result = await analyze(BASE_URL)

    signal_types = [s.signal_type for s in result.gap_signals]
    assert "no_sitemap" in signal_types


# ---------------------------------------------------------------------------
# Signal 4: no_robots_txt
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_no_robots_txt_detected_on_404(httpx_mock, no_pagespeed_key):
    """no_robots_txt fired when robots.txt returns 404."""
    httpx_mock.add_response(url=BASE_URL, status_code=200, text=FULL_HTML)
    httpx_mock.add_response(url=f"{BASE_URL}/sitemap.xml", status_code=200)
    httpx_mock.add_response(url=f"{BASE_URL}/robots.txt", status_code=404)

    result = await analyze(BASE_URL)

    signal_types = [s.signal_type for s in result.gap_signals]
    assert "no_robots_txt" in signal_types

    sig = next(s for s in result.gap_signals if s.signal_type == "no_robots_txt")
    assert sig.is_hard is False
    assert sig.description


@pytest.mark.asyncio
async def test_no_robots_txt_absent_when_present(httpx_mock, no_pagespeed_key):
    """no_robots_txt NOT fired when robots.txt returns 200."""
    httpx_mock.add_response(url=BASE_URL, status_code=200, text=FULL_HTML)
    _mock_aux(httpx_mock)

    result = await analyze(BASE_URL)

    signal_types = [s.signal_type for s in result.gap_signals]
    assert "no_robots_txt" not in signal_types


@pytest.mark.asyncio
async def test_no_robots_txt_on_network_error(httpx_mock, no_pagespeed_key):
    """no_robots_txt fired when robots.txt is unreachable (network error)."""
    httpx_mock.add_response(url=BASE_URL, status_code=200, text=FULL_HTML)
    httpx_mock.add_response(url=f"{BASE_URL}/sitemap.xml", status_code=200)
    httpx_mock.add_exception(
        httpx.ConnectError("timeout"),
        url=f"{BASE_URL}/robots.txt",
    )

    result = await analyze(BASE_URL)

    signal_types = [s.signal_type for s in result.gap_signals]
    assert "no_robots_txt" in signal_types


# ---------------------------------------------------------------------------
# Signal 5: no_schema_markup
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_no_schema_markup_detected(httpx_mock, no_pagespeed_key):
    """no_schema_markup fired when neither JSON-LD nor microdata is present."""
    httpx_mock.add_response(url=BASE_URL, status_code=200, text=NO_SCHEMA_HTML)
    _mock_aux(httpx_mock)

    result = await analyze(BASE_URL)

    signal_types = [s.signal_type for s in result.gap_signals]
    assert "no_schema_markup" in signal_types

    sig = next(s for s in result.gap_signals if s.signal_type == "no_schema_markup")
    assert sig.is_hard is False
    assert sig.description


@pytest.mark.asyncio
async def test_no_schema_markup_absent_with_json_ld(httpx_mock, no_pagespeed_key):
    """no_schema_markup NOT fired when JSON-LD script tag is present."""
    httpx_mock.add_response(url=BASE_URL, status_code=200, text=FULL_HTML)
    _mock_aux(httpx_mock)

    result = await analyze(BASE_URL)

    signal_types = [s.signal_type for s in result.gap_signals]
    assert "no_schema_markup" not in signal_types


@pytest.mark.asyncio
async def test_no_schema_markup_absent_with_microdata(httpx_mock, no_pagespeed_key):
    """no_schema_markup NOT fired when itemscope microdata is present."""
    httpx_mock.add_response(url=BASE_URL, status_code=200, text=MICRODATA_HTML)
    _mock_aux(httpx_mock)

    result = await analyze(BASE_URL)

    signal_types = [s.signal_type for s in result.gap_signals]
    assert "no_schema_markup" not in signal_types


# ---------------------------------------------------------------------------
# Signal 6: no_viewport_tag
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_no_viewport_tag_detected(httpx_mock, no_pagespeed_key):
    """no_viewport_tag fired when mobile viewport meta tag is absent."""
    httpx_mock.add_response(url=BASE_URL, status_code=200, text=NO_VIEWPORT_HTML)
    _mock_aux(httpx_mock)

    result = await analyze(BASE_URL)

    signal_types = [s.signal_type for s in result.gap_signals]
    assert "no_viewport_tag" in signal_types

    sig = next(s for s in result.gap_signals if s.signal_type == "no_viewport_tag")
    assert sig.is_hard is False
    assert sig.description


@pytest.mark.asyncio
async def test_no_viewport_tag_absent_when_present(httpx_mock, no_pagespeed_key):
    """no_viewport_tag NOT fired when viewport meta tag is present."""
    httpx_mock.add_response(url=BASE_URL, status_code=200, text=FULL_HTML)
    _mock_aux(httpx_mock)

    result = await analyze(BASE_URL)

    signal_types = [s.signal_type for s in result.gap_signals]
    assert "no_viewport_tag" not in signal_types


# ---------------------------------------------------------------------------
# Edge case: malformed HTML (no <head> section)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_soft_signals_with_no_head_section(httpx_mock, no_pagespeed_key):
    """Soft signal detection does not crash on HTML with no <head> section."""
    httpx_mock.add_response(url=BASE_URL, status_code=200, text=NO_HEAD_HTML)
    _mock_aux(httpx_mock)

    result = await analyze(BASE_URL)

    # Should detect missing meta title, description, viewport, and schema
    signal_types = [s.signal_type for s in result.gap_signals]
    assert "missing_meta_title" in signal_types
    assert "missing_meta_description" in signal_types
    assert "no_viewport_tag" in signal_types
    assert "no_schema_markup" in signal_types
    # Should not crash — result is valid
    assert isinstance(result.gap_score, float)


@pytest.mark.asyncio
async def test_soft_signals_with_empty_html(httpx_mock, no_pagespeed_key):
    """Soft signal detection does not crash on completely empty HTML response."""
    # An empty body still parses — BeautifulSoup handles it gracefully.
    # The analyzer skips _analyze_html when html is falsy (empty string),
    # so HTML-based signals do not fire; only sitemap/robots signals may fire.
    httpx_mock.add_response(url=BASE_URL, status_code=200, text=EMPTY_HTML)
    httpx_mock.add_response(url=f"{BASE_URL}/sitemap.xml", status_code=404)
    httpx_mock.add_response(url=f"{BASE_URL}/robots.txt", status_code=404)

    result = await analyze(BASE_URL)

    # No crash — result is valid
    assert result.has_hard_signal is False
    # sitemap and robots signals fire (they check paths independently)
    signal_types = [s.signal_type for s in result.gap_signals]
    assert "no_sitemap" in signal_types
    assert "no_robots_txt" in signal_types


# ---------------------------------------------------------------------------
# Soft signals only → has_hard_signal = False
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_soft_signals_only_no_hard_signal(httpx_mock, no_pagespeed_key):
    """Business with only soft signals → has_hard_signal=False (excluded from pipeline)."""
    # FULL_HTML has sitemap+robots mocked as 200, but all HTML signals clean.
    # Use an HTML that triggers ALL soft signals with an HTTPS URL (no hard signals).
    ALL_SOFT_HTML = (
        "<html><body><p>No meta tags at all.</p></body></html>"
    )
    httpx_mock.add_response(url=BASE_URL, status_code=200, text=ALL_SOFT_HTML)
    httpx_mock.add_response(url=f"{BASE_URL}/sitemap.xml", status_code=404)
    httpx_mock.add_response(url=f"{BASE_URL}/robots.txt", status_code=404)

    result = await analyze(BASE_URL)

    # Must have only soft signals
    assert result.has_hard_signal is False
    soft_signals = [s for s in result.gap_signals if not s.is_hard]
    hard_signals = [s for s in result.gap_signals if s.is_hard]
    assert len(hard_signals) == 0
    assert len(soft_signals) > 0


@pytest.mark.asyncio
async def test_soft_signals_add_to_gap_score(httpx_mock, no_pagespeed_key):
    """Soft signals contribute to gap_score at a lower weight than hard signals."""
    # Trigger all soft signals on an HTTPS site (no hard signals)
    ALL_SOFT_HTML = "<html><body><p>No meta tags.</p></body></html>"
    httpx_mock.add_response(url=BASE_URL, status_code=200, text=ALL_SOFT_HTML)
    httpx_mock.add_response(url=f"{BASE_URL}/sitemap.xml", status_code=404)
    httpx_mock.add_response(url=f"{BASE_URL}/robots.txt", status_code=404)

    result = await analyze(BASE_URL)

    soft_count = sum(1 for s in result.gap_signals if not s.is_hard)
    assert soft_count > 0
    assert result.gap_score > 0
    # Each soft signal contributes less than a hard signal weight (10.0)
    # So score per soft signal < 10.0
    score_per_soft = result.gap_score / soft_count
    assert score_per_soft < 10.0


@pytest.mark.asyncio
async def test_soft_weight_less_than_hard_weight(httpx_mock, no_pagespeed_key):
    """A single soft signal contributes less to gap_score than a single hard signal."""
    # Site with only missing title (one soft signal, no hard signal)
    ONE_SOFT_HTML = (
        "<html><head>"
        "<meta name='description' content='desc'>"
        "<meta name='viewport' content='width=device-width'>"
        "<script type='application/ld+json'>{}</script>"
        "</head><body></body></html>"
    )
    httpx_mock.add_response(url=BASE_URL, status_code=200, text=ONE_SOFT_HTML)
    _mock_aux(httpx_mock)

    soft_result = await analyze(BASE_URL)

    # Only missing_meta_title should fire
    signal_types = [s.signal_type for s in soft_result.gap_signals]
    assert "missing_meta_title" in signal_types
    assert soft_result.has_hard_signal is False

    # Now check a hard-signal-only case (no_website → single hard signal)
    hard_result = await analyze(None)

    # The hard signal's score must exceed the soft signal's score
    assert hard_result.gap_score > soft_result.gap_score
