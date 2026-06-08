# 0024 — Gap Analyzer: Extended SEO Signals

**Type:** ready-for-agent
**Blocked by:** None

## Problem Statement

The gap analyzer surfaces technical deficiencies in a business's web presence to help the user identify sales opportunities. The current soft signal set covers only the most basic on-page SEO markers — meta title, meta description, sitemap, robots.txt, schema markup, and viewport tag. This leaves a significant portion of detectable SEO gaps unaddressed: Core Web Vitals performance issues, missing social sharing metadata, absent analytics instrumentation, structural heading problems, and inaccessible images. Salespeople cannot pitch the full scope of the SEO Package or Website Modernisation service because the signals that would support those conversations are never surfaced.

## Solution

Extend the gap analyzer with 8 new soft gap signals, all detectable without new external API dependencies. Three signals are extracted from the existing PageSpeed Insights API response (which is already fetched but only partially consumed). Five are detected via HTML parsing of the homepage. Each new signal maps to an existing Service and ships with a `SIGNAL_SERVICE` entry and sales-ready `SIGNAL_SALES_COPY`.

## User Stories

1. As a salesperson reviewing a Lead, I want to see a `slow_lcp` signal when a site's Largest Contentful Paint exceeds 4 seconds, so that I can open the Website Modernisation conversation with a specific, measurable problem.
2. As a salesperson reviewing a Lead, I want to see a `high_cls` signal when a site's Cumulative Layout Shift exceeds 0.25, so that I can explain to the prospect that their pages jump around on mobile and drive away customers.
3. As a salesperson reviewing a Lead, I want to see a `slow_inp` signal when a site's Interaction to Next Paint exceeds 500ms, so that I can point to sluggish button responses as evidence the site needs modernisation.
4. As a salesperson reviewing a Lead, I want Core Web Vitals signals to fire independently of `low_pagespeed`, so that I can catch underperforming sites that narrowly pass the PageSpeed threshold but still fail on specific metrics.
5. As a salesperson reviewing a Lead, I want to see a `no_og_image` signal when a site has no `og:image` meta tag, so that I can show the prospect that every Facebook or WhatsApp share of their site produces a blank, unbranded card.
6. As a salesperson reviewing a Lead, I want to see a `no_analytics` signal when no recognisable analytics snippet is detected on the homepage, so that I can pitch GA4 setup to a business that is flying blind with no conversion data.
7. As a salesperson reviewing a Lead, I want to see a `non_standard_analytics` signal when a non-GA4/GTM tool is detected but GA4 is absent, so that I can pitch extending their existing analytics setup with richer search and conversion tracking.
8. As a salesperson reviewing a Lead, I want the `non_standard_analytics` signal to appear only on leads that already qualified via a hard signal, so that well-built sites using deliberate analytics choices (e.g. Plausible) are not mischaracterised as deficient.
9. As a salesperson reviewing a Lead, I want to see a `missing_h1` signal when the page has no H1 tag, so that I can explain that search engines have no clear signal about the page's primary topic.
10. As a salesperson reviewing a Lead, I want to see a `no_image_alt_text` signal when a page has three or more images and none have alt attributes, so that I can pitch an SEO Package that improves both accessibility and image search visibility.
11. As a salesperson reviewing a Lead, I want every new signal to include a `service` field mapping to the correct Service, so that I know which product to lead with in my outreach.
12. As a salesperson reviewing a Lead, I want every new signal to include `sales_copy` prose written from the perspective of someone about to call the business, so that I have a ready-made talking point for each gap.
13. As a salesperson, I want Core Web Vitals signals to map to Website Modernisation, so that they consistently point to the same engagement as other performance gaps.
14. As a salesperson, I want `no_og_image`, `no_analytics`, `non_standard_analytics`, `missing_h1`, and `no_image_alt_text` to map to the SEO Package, so that they consistently support the same service pitch.

## Implementation Decisions

- **Module to modify:** `app/gap_analyzer/analyzer.py` — the only file that needs changing. No schema changes, no new API endpoints, no new dependencies.

- **Core Web Vitals extraction:** The existing `_fetch_pagespeed` function returns only the performance score. It must be extended (or a companion function added) to also extract `audits.largest-contentful-paint.numericValue`, `audits.cumulative-layout-shift.numericValue`, and `audits.interaction-to-next-paint.numericValue` from the Lighthouse result. Poor-range thresholds: LCP > 4000ms, CLS > 0.25, INP > 500ms. CWV signals are soft; they do not affect the hard-signal qualifier.

- **CWV alongside `low_pagespeed`:** Per ADR-0004, CWV signals fire independently and are not suppressed when `low_pagespeed` fires. Both may appear on the same Lead.

- **HTML analytics detection:** The `_analyze_html` function must scan the raw HTML for known snippet patterns. Detection set: GA4 (`gtag(`, `G-` ID pattern), GTM (`GTM-`), Plausible (`plausible.io`), Hotjar (`hotjar.com`), Segment (`segment.com/analytics`). Logic: if none match → `no_analytics`; if a non-GA4/GTM match is found but no GA4/GTM match → `non_standard_analytics`; if GA4 or GTM is present → no signal.

- **`non_standard_analytics` enrichment-only:** Per ADR-0005, `non_standard_analytics` is a soft signal. It does not qualify a business as a Lead on its own.

- **`no_og_image` trigger:** Fires when `<meta property="og:image">` is absent or has an empty `content` attribute. `og:title` and `og:description` are not checked — their absence is less impactful as platforms fall back to standard meta tags.

- **`missing_h1` trigger:** Fires when the parsed HTML contains no `<h1>` element.

- **`no_image_alt_text` trigger:** Fires when the page contains three or more `<img>` elements and none have a non-empty `alt` attribute. Pages with fewer than three images are excluded to avoid false positives on near-empty or text-heavy pages.

- **`SIGNAL_SERVICE` and `SIGNAL_SALES_COPY`:** Eight new entries must be added to both dictionaries. The assertion guards at module load time will catch any omission. Sales copy must be written from the perspective of someone about to call the business, explain why the gap hurts them, and frame the relevant Service as the fix.

- **Test fixture updates:** `FULL_HTML` and `GOOD_HTML` in `test_gap_analyzer.py` must be extended to include all new "clean" fields — an `og:image` tag, a GA4 snippet, an `<h1>` tag, and at least one image with a non-empty alt attribute — so the existing no-signal baseline tests continue to pass without modification.

## Testing Decisions

A good test for this module asserts on the presence or absence of named signal types in `result.gap_signals`, and on `is_hard` / `gap_score` properties. It does not assert on description wording, internal function calls, or parsing implementation details.

**Seam 1 — `analyze()` function** (`test_gap_analyzer.py`):
- Use the existing `httpx_mock` / `no_pagespeed_key` fixture pattern.
- For each new HTML-parsed signal: one test asserting the signal fires when the field is absent, one asserting it does not fire when the field is present, and edge-case tests for malformed/empty HTML.
- For `no_image_alt_text`: test with exactly 2 images (signal must not fire), 3 images all missing alt (signal fires), 3 images with one having alt (signal must not fire).
- For `non_standard_analytics`: test with Plausible snippet present but no GA4/GTM (signal fires), with GA4 present (signal does not fire), with nothing present (only `no_analytics` fires, not `non_standard_analytics`).
- For CWV signals: extend the existing `PAGESPEED_LOW_RESPONSE` / `PAGESPEED_HIGH_RESPONSE` fixture pattern with an `audits` block. Test each metric independently above and below its Poor threshold.
- Prior art: existing soft-signal tests in `test_gap_analyzer.py` (issue #0009).

**Seam 2 — `GET /leads/run/:id`** (`test_api_gap_signal_enrichment.py`):
- Extend `ALL_SIGNAL_TYPES` with all 8 new signal types and their `is_hard=False` values.
- Add a `test_<signal>_maps_to_<service>` test for each new signal in `TestServiceField`.
- The existing parametrised `TestSalesCopyField` tests will cover the new signals automatically once `ALL_SIGNAL_TYPES` is extended.
- Prior art: existing enrichment tests in `test_api_gap_signal_enrichment.py` (issue #0011).

## Out of Scope

- Desktop Core Web Vitals (this feature uses mobile strategy only, consistent with existing PageSpeed check).
- `og:title` and `og:description` as separate signals.
- Crawling beyond the homepage for additional signal detection.
- Keyword ranking, backlink analysis, or any third-party SEO API beyond PageSpeed Insights.
- Lead qualification rule changes — `non_standard_analytics` does not surface new leads (see ADR-0005).
- Analytics-specific service category — analytics signals map to SEO Package (resolved in grilling session).

## Further Notes

- ADR-0004 documents the decision to keep `low_pagespeed` and CWV signals as independent, non-exclusive signals.
- ADR-0005 documents the decision to treat `non_standard_analytics` as enrichment-only.
- The PageSpeed API is only called when `PAGESPEED_API_KEY` is set. All three CWV signals are gated on the same key — if PageSpeed is skipped, no CWV signals fire.
- The analytics detection approach is pattern-matching on the raw HTML string. It is intentionally heuristic — false negatives (an analytics tool not in the detection set) are acceptable; false positives (flagging a business as lacking analytics when they have it) are not.
