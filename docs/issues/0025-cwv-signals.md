# 0025 — Gap Analyzer: Core Web Vitals Signals

**Type:** AFK
**Blocked by:** None

## Parent

#0024 — Gap Analyzer: Extended SEO Signals

## What to build

Extend the gap analyzer with three new soft signals derived from the existing PageSpeed Insights API response: `slow_lcp`, `high_cls`, and `slow_inp`. The PageSpeed response is already fetched but only the composite performance score is consumed. These signals extract the individual Core Web Vitals audit values and fire when they fall in Google's published "Poor" range.

**Thresholds:**
- `slow_lcp` — Largest Contentful Paint > 4000ms → Website Modernisation
- `high_cls` — Cumulative Layout Shift > 0.25 → Website Modernisation
- `slow_inp` — Interaction to Next Paint > 500ms → Website Modernisation

All three are soft signals. They fire independently of `low_pagespeed` and do not affect the hard-signal qualifier (per ADR-0004). If `PAGESPEED_API_KEY` is not set, none of the three fire (consistent with existing PageSpeed behaviour).

Each signal requires a `SIGNAL_SERVICE` entry (Website Modernisation) and sales-ready `SIGNAL_SALES_COPY` prose written from the perspective of someone about to call the business.

The `FULL_HTML` and `GOOD_HTML` test fixtures in `test_gap_analyzer.py` must be updated to include a GA4 snippet, an `og:image` tag, an `<h1>` tag, and images with alt attributes so that future signal additions do not break these baselines. Only the CWV-relevant fixture changes (PageSpeed response shape) are strictly required for this slice — the HTML fixture hardening is included here as the first slice to land.

## Acceptance criteria

- [ ] `slow_lcp` fires as a soft signal when the PageSpeed response reports LCP > 4000ms
- [ ] `slow_lcp` does not fire when LCP ≤ 4000ms
- [ ] `high_cls` fires as a soft signal when CLS > 0.25
- [ ] `high_cls` does not fire when CLS ≤ 0.25
- [ ] `slow_inp` fires as a soft signal when INP > 500ms
- [ ] `slow_inp` does not fire when INP ≤ 500ms
- [ ] All three signals fire independently of `low_pagespeed` — both may appear on the same Lead
- [ ] None of the three fire when `PAGESPEED_API_KEY` is not set
- [ ] None of the three fire when the PageSpeed API returns an error or malformed response
- [ ] All three map to `service = "Website Modernisation"` in the API response
- [ ] All three have non-empty `sales_copy` in the API response
- [ ] `FULL_HTML` and `GOOD_HTML` test fixtures are updated to include clean values for all new signal fields introduced in #0024 (og:image, GA4 snippet, h1, image alt text)
- [ ] All existing gap analyzer and enrichment tests continue to pass

## Blocked by

None — can start immediately.
