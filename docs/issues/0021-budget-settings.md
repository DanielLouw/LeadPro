# 0021 — Apify Lead Sources: Budget Settings

## What to build

Expose the `Settings` table (seeded in #0017) via a REST API and a Settings page in the frontend. Add cost estimation functions per source. These are the building blocks the Run Tracker (#0022) and Config Builder refactor (#0023) depend on.

**Backend — Settings API:**
- `GET /settings` — returns the single Settings row: `google_places_monthly_budget_usd`, `apify_monthly_budget_usd`
- `PATCH /settings` — accepts partial updates to either or both budget fields. Validates that values are positive floats.

**Backend — cost estimation:**
Pure functions (no DB, no HTTP) for estimating and recording run cost:
- `estimate_run_cost(source: str, max_results: int) -> float` — returns the estimated cost in USD using the fixed rate constants:
  - `google_places`: `ceil(max_results / 20) * 0.032`
  - `apify_google_maps`: `max_results * 0.004`
  - `apify_facebook_pages`: `max_results * 0.010`
- `get_monthly_spend(db, source_group: str, month: date) -> float` — aggregates `cost_usd` from all Run rows for the given source group (`'google_places'` or `'apify'`) in the given calendar month. Apify group covers both `apify_google_maps` and `apify_facebook_pages`.

**Frontend — Settings page:**
- New `/settings` route in the frontend
- Two editable fields: "Google Places monthly budget" and "Apify monthly budget"
- Saves via `PATCH /settings` on submit
- Accessible from the main navigation

## Acceptance criteria

- [ ] `GET /settings` returns the current budget values
- [ ] `PATCH /settings` updates one or both budget values and returns the updated row
- [ ] `PATCH /settings` rejects non-positive values with a 422 response
- [ ] `estimate_run_cost` returns correct values for all three sources across a range of `max_results` values
- [ ] `get_monthly_spend` returns correct totals when given a mix of Run rows across sources and months — rows from prior months are excluded
- [ ] Apify group spend correctly aggregates both `apify_google_maps` and `apify_facebook_pages` rows
- [ ] Settings page renders current budget values and saves updates successfully
- [ ] Unit tests: `estimate_run_cost` and `get_monthly_spend` tested with in-memory SQLite

## Blocked by

- #0017 — Apify Lead Sources: Schema Foundation
