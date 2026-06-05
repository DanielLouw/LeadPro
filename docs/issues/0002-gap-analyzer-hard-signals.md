# 0002 — Gap Analyzer: Hard Signals

**Type:** AFK
**Blocked by:** #0001

## What to build

Implement the `gap_analyzer` module — the core analysis engine. It accepts a URL (or None) and returns a list of detected Gap Signals plus a computed Gap Score. This slice covers hard signals only: the ones that qualify a business as a Lead.

The module is a pure function with no side effects. All external HTTP calls are injected or mockable so tests never hit the real network.

**Hard signals to detect:**
- No website (URL is None or empty)
- Website unreachable (timeout, DNS failure, non-2xx response)
- No HTTPS (URL uses HTTP scheme or redirects to HTTP)
- Mobile PageSpeed score below 50 (via Google PageSpeed Insights API)

## Acceptance criteria

- [x] `gap_analyzer` accepts a URL (or None) and returns a structured result: list of Gap Signals and a numeric Gap Score
- [x] Each Gap Signal has a type identifier, a severity (hard/soft), and a plain-English description suitable for display in the dashboard
- [x] All four hard signals are detected correctly
- [x] A business with no hard signals returns an empty signal list and a score of 0
- [x] Gap Score weights hard signals above soft signals (exact weights configurable, not hardcoded)
- [x] Unit tests cover: no URL, broken URL, HTTP-only site, PageSpeed below threshold, PageSpeed above threshold, API error from PageSpeed
- [x] No real network calls in tests — all HTTP responses use fixtures

## Blocked by

#0001 — Project Scaffold & DB Schema
