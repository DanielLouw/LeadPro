# PRD — Geographic Cycling & Keyword Rotation

## Problem Statement

The Google Places Text Search API returns at most ~60 results per query in a stable ranked order. Once the user has run the same search repeatedly, every new Run returns the same businesses — wasted API spend with no new Leads to show for it. With 50 US states and a fixed list of business types, the user will eventually exhaust the useful results for any given query. There is currently no mechanism to detect this exhaustion, avoid redundant searches, or systematically explore new geographic territory.

The existing Config Builder asks the user to manually pick cities, placing the burden of geographic diversification entirely on the user. There is no memory of what has already been searched.

## Solution

Replace the manual city picker with an automatic geographic cycling system. The user picks a state and one or more business types; the system tracks which `(county, search term)` combinations have been used and always picks the least-used ones next. Each unique combination is a **Search Slot**. Slots cycle round-robin — unvisited combinations go first, then the least-recently-used ones. Each business type maps to a set of **Search Terms** (synonym variants) maintained in a backend data file, multiplying the available search space per county.

A standard Run uses 3 slots at 50 results each (150 businesses total). Selecting multiple business types in the Config Builder creates one Run per type, each cycling independently through its own slots.

## User Stories

1. As a user, I want the Config Builder to show a state picker instead of a city picker, so that I don't have to manually manage which cities I search.
2. As a user, I want the system to automatically select which counties to search next, so that I always get fresh businesses without thinking about it.
3. As a user, I want the system to prefer counties I have never searched before, so that I explore new territory before repeating ground.
4. As a user, I want the system to cycle through counties round-robin once all have been visited, so that coverage stays even across a state over time.
5. As a user, I want each business type to have multiple keyword synonyms the system cycles through, so that I surface businesses that use different terminology in their Google listing.
6. As a user, I want the keyword synonyms to be managed by the system, so that I don't have to think about them or manually maintain a list.
7. As a user, I want to select multiple business types in the Config Builder, so that I can kick off searches for plumbers and electricians in one session.
8. As a user, I want selecting multiple business types to create one Run per type, so that each Run's progress and results are tracked independently.
9. As a user, I want the confirm step to tell me how many counties will be searched per Run and their combined estimated cost, so that I can make an informed decision before spending money.
10. As a user, I want the confirm step to show the total estimated cost across all Runs when I select multiple business types, so that I understand the full spend before confirming.
11. As a user, I want a standard Run to search 3 county-keyword combinations at up to 50 results each, so that I get a useful batch of Leads without excessive cost per run.
12. As a user, I want the Config Builder to hide all YAML from me, so that I never have to think about the underlying config format.
13. As a user, I want existing Runs (created with the old city-picker flow) to continue working and displaying correctly, so that my historical data is not affected.
14. As a user, I want the cost estimate for a cycling Run to be calculated server-side, so that the estimate is always consistent with the pricing constants the pipeline uses.
15. As a user, I want multiple Runs created from one multi-business-type selection to start in parallel, so that I don't have to wait for one to finish before the next begins.

## Implementation Decisions

### New Domain Concepts

**Search Term** — one keyword variant for a business category (e.g. `"plumbing contractors"` is a Search Term for the `"plumbers"` business type). The mapping from business type label to Search Terms lives in a backend data file (`backend/app/data/search_terms.py`), keyed by the exact business type string used in `businessTypes.ts`. Every business type ships with a healthy initial synonym list. The file is extended over time as synonyms are exhausted.

**Search Slot** — the atomic unit of search work: a unique `(state, county, search term)` triple stored in a new `search_slots` DB table. Each slot tracks `search_count` (times queued in a Run) and `last_run_id`. The pipeline selects the N slots with the lowest `search_count` for a given `(state, industry)`, breaking ties by `last_run_id IS NULL FIRST, last_run_id ASC`.

### Search Slot DB Table

New table: `search_slots`

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| state | VARCHAR(2) | US state abbreviation |
| county | VARCHAR(100) | County name |
| industry | VARCHAR(255) | Business type label (matches `businessTypes.ts`) |
| search_term | VARCHAR(255) | Keyword variant |
| search_count | INTEGER | Default 0 |
| last_run_id | INTEGER FK → runs | Nullable |

Unique constraint: `(state, county, industry, search_term)`.

Requires a new Alembic migration.

### Slot Lifecycle (see ADR 0008)

Slots are created lazily. When `execute_run()` processes a cycling config, it first upserts all slots for the `(state, industry)` combination — every county in the state × every search term for the industry. It then selects the N least-used slots. After the scrape and analysis complete successfully, it increments `search_count` and sets `last_run_id` on each used slot.

The county list for each state is bundled as a backend data file (`backend/app/data/counties.py`), covering all US counties.

### Search Config Shape Detection (see ADR 0009)

The cycling feature uses `source: google_places` with a different `source_config` shape. The pipeline detects the mode by inspecting `source_config`:

- **Cycling mode** — `source_config` contains `industry` (string) + `state` (string) + optional `slots_per_run` (integer, default 3). Slot selection runs at execution time.
- **Legacy mode** — `source_config` contains `queries` (list of strings). Existing behaviour unchanged.

The `GooglePlacesAdapter.fetch()` signature is unchanged — it still receives a list of query strings. Slot selection and query string generation (`"{search_term} in {county}, {state}"`) happen in `execute_run()` before the adapter is called.

### Slot Selection Function

A new function `select_and_initialize_slots(db, state, industry, n)` in the pipeline layer:
1. Resolves search terms for the industry from the data file.
2. Loads the county list for the state from the data file.
3. Upserts all `(state, county, industry, search_term)` combinations (INSERT OR IGNORE / ON CONFLICT DO NOTHING).
4. Selects N rows ordered by `search_count ASC, last_run_id IS NULL DESC, last_run_id ASC`.
5. Returns the selected `SearchSlot` rows.

After a successful run, `execute_run()` increments `search_count` and sets `last_run_id` on each selected slot.

### Config Builder Changes

The state → city picker is replaced by a state picker (single-select dropdown). Business types remain a multi-select chip grid. Selecting N business types and confirming fires N separate `POST /runs/` requests, one per type, each with `source: google_places` and the cycling `source_config` shape.

The confirm step displays per-Run and total cost estimates. The `POST /runs/estimate` endpoint is extended to compute cost for cycling configs: `slots_per_run × max_results_per_slot × cost_per_result`.

The `stateCities.ts` frontend data file is repurposed as a state name/abbreviation list only — the cities array is ignored for this flow.

### Parallel Runs

Multiple Runs created from one multi-business-type selection start concurrently. This is safe on Supabase (PostgreSQL) which handles concurrent writes via MVCC. No serialisation lock is needed.

### Cross-Run Deduplication

Not in scope for this PRD. The cycling system inherently reduces duplicate scraping by directing each Run to new counties. Full cross-run deduplication (filtering previously-seen `external_id` values before gap analysis) is a separate feature.

## Testing Decisions

**What makes a good test:** test observable behaviour — which slots get selected, that slot counts increment correctly after a run, that the API returns the right estimate — not internal implementation details like function call order.

**`select_and_initialize_slots`** — unit tested in isolation against a real test DB (same `pytest` + SQLAlchemy session pattern as existing pipeline tests). Tests cover: slots created on first call, least-used slots selected, round-robin when counts are equal, count increment after use, correct query string format generated from slot.

**`execute_run()` cycling path** — integration tested with a mock scraper (same `pytest-asyncio` + mock `_scrape_fn` pattern as existing pipeline tests). Tests cover: cycling config shape is detected correctly, N query strings are generated and passed to the scraper, slot counts are updated on success, slot counts are not updated if the run fails.

**`POST /runs/estimate` cycling shape** — HTTP test (same `pytest` + `httpx.AsyncClient` pattern). Tests cover: cycling config returns expected cost, legacy config still returns expected cost, missing `industry`/`state` returns 400.

**Frontend Config Builder** — vitest + `@testing-library/react`. Tests cover: state picker renders, selecting N business types submits N run requests, confirm step shows correct slot count and cost, YAML is never surfaced to the user.

Prior art: `backend/tests/` for pipeline and API tests; `frontend/src/**/*.test.tsx` for component tests.

## Out of Scope

- **Cross-run deduplication** — filtering previously-seen businesses before gap analysis. Separate feature.
- **Slot saturation alerting** — notifying the user when all Search Slots for a `(state, industry)` combination have been visited. Defined in CONTEXT.md as `Slot Saturation`; planned future enhancement.
- **Cycling for Apify sources** — the Apify Google Maps and Facebook Pages adapters continue to use their existing `source_config` shape unchanged. County cycling applies to Google Places only.
- **User-editable Search Terms** — synonyms are system-maintained. Users cannot add or remove them from the UI.
- **Lead detail location display** — surfacing city/address on the Lead detail slide-out. Separate task already flagged.

## Further Notes

- The `counties.py` data file covers all 3,143 US counties. Texas has 254 counties × (average 3 search terms per business type) = 762 slots — enough runway for months of daily Runs before any slot is reused.
- The `search_terms.py` data file ships with a healthy initial synonym list for every business type in `businessTypes.ts`. Synonyms are added over time as existing ones approach exhaustion — no architectural change required to extend them.
- ADR 0008 documents the decision to select slots at pipeline execution time rather than Config Builder time.
- ADR 0009 documents the decision to use shape detection on `source: google_places` rather than introducing a new source key.
