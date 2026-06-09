# 0026 — Gap Analyzer: On-Page Structural SEO Signals

**Type:** AFK
**Blocked by:** #0025

## Parent

#0024 — Gap Analyzer: Extended SEO Signals

## What to build

Extend the gap analyzer with three new soft signals detected via HTML parsing of the homepage: `no_og_image`, `missing_h1`, and `no_image_alt_text`. All three map to the SEO Package.

**Signal definitions:**
- `no_og_image` — fires when `<meta property="og:image">` is absent or has an empty `content` attribute. Only `og:image` is checked; `og:title` and `og:description` are out of scope.
- `missing_h1` — fires when the parsed HTML contains no `<h1>` element.
- `no_image_alt_text` — fires when the page contains three or more `<img>` elements and none have a non-empty `alt` attribute. Pages with fewer than three images do not trigger this signal.

Each signal requires a `SIGNAL_SERVICE` entry (SEO Package) and sales-ready `SIGNAL_SALES_COPY` prose written from the perspective of someone about to call the business.

## Acceptance criteria

- [ ] `no_og_image` fires when `og:image` meta tag is absent
- [ ] `no_og_image` fires when `og:image` meta tag is present but `content` is empty
- [ ] `no_og_image` does not fire when a non-empty `og:image` is present
- [ ] `missing_h1` fires when the page has no `<h1>` element
- [ ] `missing_h1` does not fire when an `<h1>` is present
- [ ] `no_image_alt_text` fires when the page has ≥3 images and none have a non-empty `alt` attribute
- [ ] `no_image_alt_text` does not fire when the page has fewer than 3 images
- [ ] `no_image_alt_text` does not fire when at least one image has a non-empty `alt` attribute
- [ ] All three signals are soft (`is_hard = False`)
- [ ] All three map to `service = "SEO Package"` in the API response
- [ ] All three have non-empty `sales_copy` in the API response
- [ ] All three signals handle malformed HTML and headless pages without crashing
- [ ] All existing gap analyzer and enrichment tests continue to pass

## Blocked by

- #0025 — Gap Analyzer: Core Web Vitals Signals (fixture hardening lands there first)
