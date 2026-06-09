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
    "few_google_reviews": "Fewer than 20 Google reviews — minimal local search visibility",
}

SOFT_SIGNALS = {
    "missing_meta_title": "Missing or empty <title> tag",
    "missing_meta_description": "Missing meta description",
    "no_sitemap": "No sitemap.xml found",
    "no_robots_txt": "No robots.txt found",
    "no_schema_markup": "No schema markup (JSON-LD or microdata) found",
    "no_viewport_tag": "No mobile viewport meta tag",
    "slow_lcp": "Largest Contentful Paint exceeds 4 seconds (Poor)",
    "high_cls": "Cumulative Layout Shift exceeds 0.25 (Poor)",
    "slow_inp": "Interaction to Next Paint exceeds 500ms (Poor)",
}

# ---------------------------------------------------------------------------
# Enrichment lookups — derived at serialisation time, no DB columns needed
# ---------------------------------------------------------------------------

SIGNAL_SERVICE: dict[str, str] = {
    "no_website": "Website Build",
    "broken_website": "Website Build",
    "no_https": "Website Build",
    "low_pagespeed": "Website Modernisation",
    "no_viewport_tag": "Website Modernisation",
    "slow_lcp": "Website Modernisation",
    "high_cls": "Website Modernisation",
    "slow_inp": "Website Modernisation",
    "missing_meta_title": "SEO Package",
    "missing_meta_description": "SEO Package",
    "no_sitemap": "SEO Package",
    "no_robots_txt": "SEO Package",
    "no_schema_markup": "SEO Package",
    "few_google_reviews": "SEO Package",
}

SIGNAL_SALES_COPY: dict[str, str] = {
    "no_website": (
        "This business has no website at all — every potential customer who searches "
        "online hits a dead end before they ever make contact. In a market where "
        "competitors are just a click away, the absence of any web presence is costing "
        "them customers daily. Open the conversation around how a professionally built "
        "site becomes their 24/7 sales rep — a Website Build is the natural entry point."
    ),
    "broken_website": (
        "Their website exists but is unreachable — visitors land on error pages or "
        "timeouts, which signals an unreliable business and destroys first impressions "
        "instantly. Search engines will also drop a broken site from rankings. Frame "
        "the pitch around the risk of lost revenue every day the site stays down: a "
        "rebuilt Website Build eliminates the problem at its root."
    ),
    "no_https": (
        "This site is flagged as 'Not Secure' by every modern browser, which kills "
        "trust and conversion rates before a visitor even reads the page. Google also "
        "penalises non-HTTPS sites in rankings. Frame the conversation around "
        "credibility and Google ranking — a full Website Build with HTTPS baked in "
        "from the start is the clean fix."
    ),
    "low_pagespeed": (
        "Their mobile PageSpeed score is critically low, meaning the site loads too "
        "slowly for most smartphone users who will bounce before it finishes. Google "
        "uses page speed as a direct ranking signal, so slow sites slip down search "
        "results over time. The pitch is about modernising the technical foundation — "
        "a Website Modernisation engagement can get their score into a competitive range."
    ),
    "no_viewport_tag": (
        "The site lacks a mobile viewport tag, so it renders as a shrunken desktop "
        "page on smartphones — difficult to read, hard to tap, and frustrating to use. "
        "Given that the majority of local searches happen on mobile, this directly "
        "impacts how many callers they convert. A Website Modernisation brings "
        "proper responsive design and fixes this immediately."
    ),
    "missing_meta_title": (
        "There is no page title tag, which means Google has nothing to display in "
        "search results and must guess — often producing ugly, truncated snippets that "
        "get ignored. The title is the single highest-impact on-page SEO element. "
        "Lead with the opportunity: an SEO Package gives every page a crafted title "
        "that matches what their customers actually search for."
    ),
    "missing_meta_description": (
        "The site has no meta description, so search engines write their own snippet — "
        "which is rarely compelling or relevant. A strong description acts as free ad "
        "copy in Google results, driving click-throughs from people actively looking "
        "for exactly what this business offers. An SEO Package includes optimised "
        "descriptions that turn impressions into visits."
    ),
    "no_sitemap": (
        "Without a sitemap.xml, search engine crawlers have to discover pages by "
        "following links alone — meaning new or deeper pages can go unindexed for "
        "weeks or never. For a business that adds services or content regularly, this "
        "invisibility costs them organic traffic. An SEO Package includes sitemap "
        "generation and submission so Google always knows what to index."
    ),
    "no_robots_txt": (
        "The absence of a robots.txt is a small but telling gap — it suggests the "
        "site was set up without professional SEO care, and it can lead to crawl "
        "budget waste or accidental indexing of admin pages. It is also an easy early "
        "win to demonstrate expertise to a prospect. An SEO Package covers this as "
        "part of a complete technical SEO foundation."
    ),
    "no_schema_markup": (
        "The site has no schema markup, so it misses out on rich results — star "
        "ratings, business hours, FAQs, and review snippets that appear directly in "
        "Google search results. Competitors with schema stand out visually while this "
        "business blends into plain blue links. An SEO Package adds structured data "
        "that can unlock these higher-visibility result formats."
    ),
    "slow_lcp": (
        "The site's Largest Contentful Paint is in Google's 'Poor' range — the main "
        "content takes more than 4 seconds to appear on mobile, which is long enough "
        "for most visitors to give up and call a competitor instead. Google also uses "
        "LCP as a direct ranking signal, so slow load times push the site down in "
        "search results. A Website Modernisation engagement targets the specific "
        "bottlenecks — oversized images, render-blocking scripts, slow hosting — that "
        "are causing this delay."
    ),
    "high_cls": (
        "The site has a high Cumulative Layout Shift score, meaning buttons, text, and "
        "images jump around the screen while the page loads. This makes the site feel "
        "broken and causes accidental taps on mobile — a direct hit to conversions. "
        "Google factors layout stability into rankings, so unstable pages are penalised "
        "in search. A Website Modernisation fixes the root causes: unspecified image "
        "dimensions, late-loading ads, and dynamic content inserted without reserving space."
    ),
    "slow_inp": (
        "The site's Interaction to Next Paint is in Google's 'Poor' range — when a "
        "visitor taps a button or link, the page takes over 500ms to respond, which "
        "feels sluggish and unresponsive. On mobile, where most local searches happen, "
        "this friction kills trust before the prospect ever picks up the phone. A "
        "Website Modernisation identifies the JavaScript and third-party scripts "
        "blocking the main thread and eliminates the delay."
    ),
    "few_google_reviews": (
        "This business has fewer than 20 Google reviews, which puts them at a serious "
        "disadvantage in local search — Google's algorithm favours businesses with "
        "strong review volume, and most consumers won't trust a business they can't "
        "verify through social proof. Competitors with more reviews will consistently "
        "rank above them and convert at higher rates. An SEO Package that includes "
        "review generation strategy and Google Business Profile optimisation can close "
        "this gap quickly and create visible results within weeks."
    ),
}


_ALL_SIGNAL_TYPES = set(HARD_SIGNALS) | set(SOFT_SIGNALS)
assert SIGNAL_SERVICE.keys() == _ALL_SIGNAL_TYPES, (
    f"SIGNAL_SERVICE is missing keys: {_ALL_SIGNAL_TYPES - SIGNAL_SERVICE.keys()}"
)
assert SIGNAL_SALES_COPY.keys() == _ALL_SIGNAL_TYPES, (
    f"SIGNAL_SALES_COPY is missing keys: {_ALL_SIGNAL_TYPES - SIGNAL_SALES_COPY.keys()}"
)


def get_signal_service(signal_type: str) -> str:
    try:
        return SIGNAL_SERVICE[signal_type]
    except KeyError:
        raise ValueError(f"Unknown signal type: {signal_type!r}") from None


def get_signal_sales_copy(signal_type: str) -> str:
    try:
        return SIGNAL_SALES_COPY[signal_type]
    except KeyError:
        raise ValueError(f"Unknown signal type: {signal_type!r}") from None


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


def analyze_review_signals(review_count: int | None) -> list[GapSignalResult]:
    """Return gap signals derived from Google review count (Apify-sourced data)."""
    if review_count is None or review_count >= 20:
        return []
    return [
        GapSignalResult(
            signal_type="few_google_reviews",
            is_hard=True,
            description=f"{HARD_SIGNALS['few_google_reviews']} ({review_count} reviews)",
        )
    ]


@dataclass
class PageSpeedResult:
    performance_score: int
    lcp_ms: float | None = None
    cls: float | None = None
    inp_ms: float | None = None


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

        pagespeed = await _fetch_pagespeed(normalized)
        if pagespeed is not None:
            if pagespeed.performance_score < 50:
                signals.append(
                    GapSignalResult(
                        "low_pagespeed",
                        True,
                        f"{HARD_SIGNALS['low_pagespeed']} (score: {pagespeed.performance_score})",
                    )
                )
            if pagespeed.lcp_ms is not None and pagespeed.lcp_ms > 4000:
                signals.append(GapSignalResult("slow_lcp", False, SOFT_SIGNALS["slow_lcp"]))
            if pagespeed.cls is not None and pagespeed.cls > 0.25:
                signals.append(GapSignalResult("high_cls", False, SOFT_SIGNALS["high_cls"]))
            if pagespeed.inp_ms is not None and pagespeed.inp_ms > 500:
                signals.append(GapSignalResult("slow_inp", False, SOFT_SIGNALS["slow_inp"]))

    score = float(sum(HARD_SIGNAL_WEIGHT if s.is_hard else SOFT_SIGNAL_WEIGHT for s in signals))
    has_hard = any(s.is_hard for s in signals)

    return AnalysisResult(gap_signals=signals, gap_score=score, has_hard_signal=has_hard)


async def _fetch_html(client: httpx.AsyncClient, url: str) -> tuple[str | None, bool]:
    """Returns (html, had_error)."""
    try:
        response = await client.get(url, headers={"User-Agent": "LeadPro/1.0"})
        if response.status_code >= 400:
            return None, True
        return response.text, False
    except httpx.RequestError:
        return None, True


async def _check_path_missing(client: httpx.AsyncClient, base_url: str, path: str) -> bool:
    """Returns True if the resource at path is absent (non-200 or unreachable)."""
    parsed = urlparse(base_url)
    url = f"{parsed.scheme}://{parsed.netloc}{path}"
    try:
        resp = await client.get(url, headers={"User-Agent": "LeadPro/1.0"})
        return resp.status_code != 200
    except httpx.RequestError:
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


async def _fetch_pagespeed(url: str) -> PageSpeedResult | None:
    if not settings.PAGESPEED_API_KEY:
        return None

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(
                "https://www.googleapis.com/pagespeedonline/v5/runPagespeed",
                params={"url": url, "strategy": "mobile", "key": settings.PAGESPEED_API_KEY},
            )
            data: dict[str, Any] = resp.json()
            lhr = data["lighthouseResult"]
            score = int(lhr["categories"]["performance"]["score"] * 100)
            audits = lhr.get("audits", {})
            lcp = audits.get("largest-contentful-paint", {}).get("numericValue")
            cls = audits.get("cumulative-layout-shift", {}).get("numericValue")
            inp = audits.get("interaction-to-next-paint", {}).get("numericValue")
            return PageSpeedResult(
                performance_score=score,
                lcp_ms=float(lcp) if lcp is not None else None,
                cls=float(cls) if cls is not None else None,
                inp_ms=float(inp) if inp is not None else None,
            )
    except Exception:
        return None
