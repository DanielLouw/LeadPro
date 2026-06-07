# ADR 0003 — Nested `source_config` Block in Search Config YAML

**Status:** Accepted  
**Date:** 2026-06-07

## Context

Each Lead Source requires different input parameters. Google Places API uses free-text query strings; Apify Google Maps Scraper takes a `search_term` plus explicit geo fields; Apify Facebook Pages Scraper takes a keyword + location string. These inputs are carried in `config_yaml` on the `Run` row.

Two layouts were considered:

**Option A — Flat:** All keys at the top level of the YAML document.
```yaml
source: apify_google_maps
max_results_per_run: 10
search_term: plumbers
city: Austin
state: TX
```

**Option B — Nested `source_config` block:** Shared run parameters at the top level; source-specific inputs nested under a `source_config` key.
```yaml
source: apify_google_maps
max_results_per_run: 10
source_config:
  search_term: plumbers
  city: Austin
  state: TX
```

## Decision

Use a **nested `source_config` block (Option B)**.

## Reasons

- A flat structure risks key collisions as more sources are added — two different sources could legitimately use the same key name with different semantics (e.g. `query` means different things to different actors).
- The pipeline reads shared parameters (`max_results_per_run`) at the top level, then passes `source_config` as an opaque dict to the matching adapter. This boundary is explicit and enforced by structure, not by documentation.
- Each adapter validates its own `source_config` block independently, making source configs independently testable without touching shared keys.
- The pattern scales naturally to future sources — adding a new source never requires checking for key conflicts with existing ones.

## Consequences

- The pipeline must parse YAML in two passes: shared keys first, then `source_config` delegated to the adapter.
- The Config Builder generates YAML with the nested structure. All existing Google Places configs (which predate this ADR) must be treated as having an implicit `source: google_places` and their `queries` list wrapped under `source_config` during migration or on read.
