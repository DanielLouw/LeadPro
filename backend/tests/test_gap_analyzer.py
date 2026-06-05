"""Tests for gap_analyzer hard signals (issue #0002)."""

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
async def test_no_https_explicit_http(httpx_mock):
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
async def test_clean_site_no_hard_signals(httpx_mock):
    httpx_mock.add_response(
        url="https://example.com",
        status_code=200,
        text=GOOD_HTML,
    )
    httpx_mock.add_response(url="https://example.com/sitemap.xml", status_code=200)
    httpx_mock.add_response(url="https://example.com/robots.txt", status_code=200)
    # No PAGESPEED_API_KEY set — pagespeed check skipped

    result = await analyze("https://example.com")

    assert result.has_hard_signal is False
    assert result.gap_score == 0

    hard_signals = [s for s in result.gap_signals if s.is_hard]
    assert len(hard_signals) == 0
