# 0017 — Apify Lead Sources: Schema Foundation

## What to build

Lay the database and dataclass foundation that every subsequent Apify integration slice depends on. No behaviour changes to the running app — existing Google Places runs continue to work identically after this slice lands.

**Migrations (Alembic):**
- Rename `leads.place_id` → `leads.external_id` (VARCHAR 255, NOT NULL). Update the unique constraint from `(run_id, place_id)` to `(run_id, external_id)`.
- Add `runs.source` — VARCHAR 50, NOT NULL, check constraint enforcing `('google_places', 'apify_google_maps', 'apify_facebook_pages')`. Backfill all existing rows to `google_places`.
- Add `runs.apify_run_id` — VARCHAR 255, NULLABLE. Stores the Apify actor run ID while a run is in progress; null for all Google Places runs.
- Add `runs.apify_status` — VARCHAR 100, NULLABLE. Human-readable polling status string written by the background task during Apify runs; null for Google Places runs.
- Add `runs.cost_usd` — FLOAT, NULLABLE. Calculated and written at run completion. Null for runs completed before this migration.
- Create `settings` table — single-row table with `id` (PK), `google_places_monthly_budget_usd` FLOAT (default 200.00), `apify_monthly_budget_usd` FLOAT (default 5.00). Seed the single row on first startup if absent.

**Model updates:**
- Update all SQLAlchemy model definitions to match the migrated schema.
- Update the `RawBusiness` dataclass: rename `place_id` field to `external_id`.
- Update all references to `place_id` / `RawBusiness.place_id` in the existing scraper and pipeline to use `external_id`.

**Config change:**
- Change `DEFAULT_MAX_RESULTS_PER_RUN` constant from 500 to 10.

## Acceptance criteria

- [ ] Alembic migrations run cleanly on a fresh database and on an existing database with Google Places run data
- [ ] All existing `runs` rows have `source = 'google_places'` after migration
- [ ] `leads.external_id` column exists; `leads.place_id` no longer exists
- [ ] `settings` table exists with exactly one seeded row containing the default budget values
- [ ] `RawBusiness.external_id` replaces `RawBusiness.place_id` throughout the codebase
- [ ] Existing Google Places end-to-end flow still works after the rename (a run completes and leads are persisted correctly)
- [ ] Default max results per run is 10
- [ ] All existing tests pass

## Blocked by

None — can start immediately
