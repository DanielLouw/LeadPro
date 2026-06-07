# ADR 0002 — `source` as a Dedicated Column on `Run`, Not Embedded in `config_yaml`

**Status:** Accepted  
**Date:** 2026-06-07

## Context

Each Run has exactly one Lead Source. The source identity needs to be readable by the pipeline, the Run Tracker, cost estimation, and the UI progress component. It could be stored in two ways:

**Option A — Dedicated `source` column on `Run`:** A typed `VARCHAR` column with a DB check constraint enforcing valid values (`google_places`, `apify_google_maps`, `apify_facebook_pages`). Queryable directly in SQL.

**Option B — Embedded in `config_yaml`:** The source is just another YAML key (`source: apify_google_maps`) alongside `max_results_per_run` and `source_config`. No schema change needed.

## Decision

Add a **dedicated `source` column on `Run` (Option A)**.

## Reasons

- The Run Tracker, cost aggregation queries, and UI filtering all need to group or filter runs by source. Doing this against a YAML blob requires parsing application-side — slow, error-prone, and impossible to index.
- A DB check constraint enforces valid source values at write time, preventing silent corruption from typos or stale configs.
- `source` is a first-class property of a Run, not a scraping detail. It belongs in the structured schema alongside `status`, `total_leads`, and `created_at`.
- `config_yaml` is retained for source-specific input parameters (the `source_config` block) — it is not the right place for metadata that the rest of the system needs to act on.

## Consequences

- An Alembic migration is required to add the `source` column and backfill existing runs as `google_places`.
- The check constraint must be updated each time a new Lead Source is added to the registry.
- `config_yaml` continues to carry the `source_config` block for source-specific inputs, but the top-level `source` key in YAML is now redundant — the pipeline reads `source` from the DB row, not the YAML.
