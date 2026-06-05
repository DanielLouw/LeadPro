"""
Gap analyzer: given a website URL, returns detected gap signals and a computed gap score.

Hard signals (any one qualifies the business as a Lead):
  - no_website
  - broken_website
  - no_https
  - low_pagespeed (mobile score < 50)

Soft signals (contribute to Gap Score only):
  - missing_meta_title
  - missing_meta_description
  - no_sitemap
  - no_robots_txt
  - no_schema_markup
  - no_viewport_tag
"""

from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup

from app.config import settings

HARD_SIGNAL_WEIGHT = 10.0
SOFT_SIGNAL_WEIGHT = 2.0

HARD_SIGNALS = {
    "no_website": "No website listed",
    "broken_website": "Website is broken or unreachable",
    "no_https": "Website does not use HTTPS",
    "low_pagespeed": "Mobile PageSpeed score below 50",
}

SOFT_SIGNALS = {
    "missing_meta_title": "Missing or empty <title> tag",
    "missing_meta_description": "Missing meta description",
    "no_sitemap": "No sitemap.xml found",
    "no_robots_txt": "No robots.txt found",
    "no_schema_markup": "No schema markup (JSON-LD or microdata) found",
    "no_viewport_tag": "No mobile viewport meta tag",
}


@dataclass
class GapSignalResult:
    signal_type: str
    is_hard: bool
    description: str


@dataclass
class AnalysisResult:
    gap_signals: list[GapSignalResult] = field(default_factory=list)
    gap_score: float = 0.0
    has_hard_signal: bool = False

    def qualifies_as_lead(self) -> bool:
        return self.has_hard_signal


async def analyze(url: str | None) -> AnalysisResult:
    """Analyze a business website and return gap signals + score."""
    if not url:
        signal = GapSignalResult(
            signal_type="no_website",
            is_hard=True,
            description=HARD_SIGNALS["no_website"],
        )
        return AnalysisResult(
            gap_signals=[signal],
            gap_score=HARD_SIGNAL_WEIGHT,
            has_hard_signal=True,
        )

    # Normalize bare domains to https:// for fetching, but preserve the original
    # scheme for the no_https check — only flag http:// URLs explicitly.
    is_explicit_http = url.startswith("http://")
    normalized = url if url.startswith(("http://", "https://")) else f"https://{url}"

    async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
        html, fetch_error = await _fetch_html(client, normalized)
        if not fetch_error:
            no_sitemap = await _check_path_missing(client, normalized, "/sitemap.xml")
            no_robots = await _check_path_missing(client, normalized, "/robots.txt")
        else:
            no_sitemap = False
            no_robots = False

    signals: list[GapSignalResult] = []

    if fetch_error:
        signals.append(GapSignalResult("broken_website", True, HARD_SIGNALS["broken_website"]))
    else:
        if is_explicit_http:
            signals.append(GapSignalResult("no_https", True, HARD_SIGNALS["no_https"]))

        if html:
            signals.extend(_analyze_html(html))

        if no_sitemap:
            signals.append(GapSignalResult("no_sitemap", False, SOFT_SIGNALS["no_sitemap"]))
        if no_robots:
            signals.append(GapSignalResult("no_robots_txt", False, SOFT_SIGNALS["no_robots_txt"]))

        pagespeed_score = await _fetch_pagespeed(normalized)
        if pagespeed_score is not None and pagespeed_score < 50:
            signals.append(
                GapSignalResult(
                    "low_pagespeed",
                    True,
                    f"{HARD_SIGNALS['low_pagespeed']} (score: {pagespeed_score})",
                )
            )

    score = sum(HARD_SIGNAL_WEIGHT if s.is_hard else SOFT_SIGNAL_WEIGHT for s in signals)
    has_hard = any(s.is_hard for s in signals)

    return AnalysisResult(gap_signals=signals, gap_score=score, has_hard_signal=has_hard)


async def _fetch_html(client: httpx.AsyncClient, url: str) -> tuple[str | None, bool]:
    """Returns (html, had_error)."""
    try:
        response = await client.get(url, headers={"User-Agent": "LeadPro/1.0"})
        if response.status_code >= 400:
            return None, True
        return response.text, False
    except (httpx.RequestError, httpx.HTTPStatusError):
        return None, True


async def _check_path_missing(client: httpx.AsyncClient, base_url: str, path: str) -> bool:
    """Returns True if the resource at path is absent (non-200 or unreachable)."""
    parsed = urlparse(base_url)
    url = f"{parsed.scheme}://{parsed.netloc}{path}"
    try:
        resp = await client.get(url, headers={"User-Agent": "LeadPro/1.0"})
        return resp.status_code != 200
    except (httpx.RequestError, httpx.HTTPStatusError):
        return True


def _analyze_html(html: str) -> list[GapSignalResult]:
    signals = []
    soup = BeautifulSoup(html, "lxml")

    title = soup.find("title")
    if not title or not title.get_text(strip=True):
        signals.append(GapSignalResult("missing_meta_title", False, SOFT_SIGNALS["missing_meta_title"]))

    meta_desc = soup.find("meta", attrs={"name": "description"})
    if not meta_desc or not meta_desc.get("content", "").strip():
        signals.append(GapSignalResult("missing_meta_description", False, SOFT_SIGNALS["missing_meta_description"]))

    viewport = soup.find("meta", attrs={"name": "viewport"})
    if not viewport:
        signals.append(GapSignalResult("no_viewport_tag", False, SOFT_SIGNALS["no_viewport_tag"]))

    has_schema = bool(
        soup.find("script", attrs={"type": "application/ld+json"})
        or soup.find(attrs={"itemscope": True})
    )
    if not has_schema:
        signals.append(GapSignalResult("no_schema_markup", False, SOFT_SIGNALS["no_schema_markup"]))

    return signals


async def _fetch_pagespeed(url: str) -> int | None:
    if not settings.PAGESPEED_API_KEY:
        return None

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(
                "https://www.googleapis.com/pagespeedonline/v5/runPagespeed",
                params={"url": url, "strategy": "mobile", "key": settings.PAGESPEED_API_KEY},
            )
            data: dict[str, Any] = resp.json()
            score = data["lighthouseResult"]["categories"]["performance"]["score"]
            return int(score * 100)
    except Exception:
        return None
