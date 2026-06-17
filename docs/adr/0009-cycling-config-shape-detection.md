# ADR 0009 — Cycling Config via Shape Detection on Existing Source Key

**Status:** Accepted  
**Date:** 2026-06-17

## Context

The geographic cycling feature introduces a new Search Config shape for Google Places runs. Two approaches for expressing this in the YAML were considered:

**Option A — New source key:** Introduce `source: google_places_cycled` (or similar). The pipeline routes to a new adapter that handles slot selection.

**Option B — Shape detection on existing source key:** Keep `source: google_places`. The pipeline inspects `source_config` — if it contains `industry` + `state` keys, it enters cycling mode; if it contains `queries`, it uses the legacy direct-query path.

## Decision

Use **shape detection on the existing `source: google_places` key (Option B)**.

## Reasons

- Both modes ultimately call `scrape_queries()` with a list of query strings. The only difference is how those strings are generated — slot selection vs. user-provided. The adapter contract is unchanged.
- A new source key would fragment the source registry and require updating every place that switches on `source` (estimate endpoint, cost calculator, adapter registry, UI source selector).
- Legacy Run rows in the DB remain valid without any migration — existing `queries`-based configs continue to work unchanged.
- The detection heuristic is unambiguous: `queries` key present → legacy mode; `industry` + `state` keys present → cycling mode.

## Consequences

- The `GooglePlacesAdapter.fetch()` signature is unchanged; slot selection logic lives in `execute_run()` in the pipeline, not in the adapter.
- The `POST /runs/estimate` endpoint must handle both config shapes, computing cost from query count (legacy) or `slots_per_run × max_results_per_slot` (cycling).
- Future developers reading a cycling Search Config must know to look for the `industry`/`state` keys — the source key alone does not reveal the mode.
