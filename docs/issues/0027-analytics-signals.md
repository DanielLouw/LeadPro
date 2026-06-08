# 0027 — Gap Analyzer: Analytics Presence Signals

**Type:** AFK
**Blocked by:** #0025

## Parent

#0024 — Gap Analyzer: Extended SEO Signals

## What to build

Extend the gap analyzer with two new soft signals that detect analytics instrumentation on the homepage: `no_analytics` and `non_standard_analytics`. Both map to the SEO Package.

**Detection logic:**
Scan the raw HTML for known analytics snippet patterns:
- GA4: `gtag(` or a `G-` measurement ID
- GTM: `GTM-`
- Plausible: `plausible.io`
- Hotjar: `hotjar.com`
- Segment: `segment.com/analytics`

Signal firing rules:
- If none of the above are detected → `no_analytics`
- If a non-GA4/GTM pattern is found but no GA4/GTM pattern → `non_standard_analytics`
- If GA4 or GTM is present → no signal

The two signals are mutually exclusive. `non_standard_analytics` is a soft signal and does not qualify a business as a Lead on its own (per ADR-0005) — it serves as enrichment context on leads that already qualified via a hard signal.

Each signal requires a `SIGNAL_SERVICE` entry (SEO Package) and sales-ready `SIGNAL_SALES_COPY` prose. The `no_analytics` copy should pitch GA4 setup to a business flying blind. The `non_standard_analytics` copy should acknowledge the existing tool and pitch extending their setup with GA4 for richer search and conversion tracking.

## Acceptance criteria

- [ ] `no_analytics` fires when no recognised analytics snippet is detected in the HTML
- [ ] `no_analytics` does not fire when GA4 is present
- [ ] `no_analytics` does not fire when GTM is present
- [ ] `no_analytics` does not fire when Plausible, Hotjar, or Segment is present
- [ ] `non_standard_analytics` fires when Plausible, Hotjar, or Segment is detected but no GA4/GTM
- [ ] `non_standard_analytics` does not fire when GA4 is present
- [ ] `non_standard_analytics` does not fire when GTM is present
- [ ] `non_standard_analytics` does not fire when nothing is detected (only `no_analytics` fires in that case)
- [ ] The two signals are mutually exclusive — both never fire on the same Lead
- [ ] Both signals are soft (`is_hard = False`)
- [ ] Both map to `service = "SEO Package"` in the API response
- [ ] Both have non-empty `sales_copy` in the API response
- [ ] All existing gap analyzer and enrichment tests continue to pass

## Blocked by

- #0025 — Gap Analyzer: Core Web Vitals Signals (fixture hardening lands there first)
