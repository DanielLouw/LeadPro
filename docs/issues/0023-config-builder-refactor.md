# 0023 — Apify Lead Sources: Config Builder Refactor

## What to build

Refactor the Config Builder page to support multi-source run configuration and a more compact business type picker. This is the user-facing entry point for the entire Apify integration — the source a user selects here determines which adapter the pipeline uses.

**Source selector:**
- A dropdown at the top of the Config Builder: "Lead Source — [Google Places API ▾]" with options:
  - Google Places API
  - Apify — Google Maps Scraper
  - Apify — Facebook Pages Scraper
- Selecting a source reshapes the form below it:
  - **Google Places API**: existing query builder (business types + city picker → generates query strings)
  - **Apify — Google Maps Scraper**: search term input + city + state dropdowns (single geo target per run)
  - **Apify — Facebook Pages Scraper**: single keyword + location text field (e.g. "plumbers Austin Texas")

**Business type chip grid (all sources that use business type selection):**
- Replace the current vertical checkbox lists with a compact chip/badge grid
- Flex-wrap layout, approximately 4 chips per row
- Each chip shows the business type label; selected state = filled/highlighted, unselected = outlined
- Group labels (Home Services, Health & Wellness, etc.) remain as section headers above their chip groups
- Custom business type input remains below the grid

**Updated cost estimate confirm step:**
- For Google Places: existing behaviour (query count, estimated results, estimated cost in USD)
- For Apify sources: shows estimated cost for this run + remaining monthly Apify budget after this run (fetched from `GET /runs/monthly-spend`)
- Example: "10 results · $0.04 estimated · $3.76 remaining after this run"
- If the run would exceed the remaining Apify budget, show a warning but do not block the user from proceeding

**Config YAML generated:**
Generates the new nested `source_config` shape for all sources, including Google Places:
```yaml
source: google_places
max_results_per_run: 10
source_config:
  queries:
    - plumbers in Austin TX
```

**Apify status in Lead Results:**
On the Lead Results page, when viewing a Run with an Apify source, replace the progress bar with the `apify_status` string from the Run row. Poll the run status endpoint until the run is no longer in the `running` state.

## Acceptance criteria

- [ ] Source selector dropdown renders at the top of the Config Builder with all three options
- [ ] Selecting Google Places shows the existing business type + city form
- [ ] Selecting Apify Google Maps shows search term + city + state fields
- [ ] Selecting Apify Facebook Pages shows a single keyword + location text field
- [ ] Business types render as a chip grid — all 39 types visible without scrolling past the section
- [ ] Selected chips are visually distinct from unselected chips
- [ ] Config Builder generates the correct nested `source_config` YAML for each source
- [ ] Cost estimate confirm step shows estimated cost for all sources
- [ ] Apify confirm step shows remaining monthly budget and warns (but does not block) if budget would be exceeded
- [ ] Lead Results page shows `apify_status` string (not a progress bar) for Apify runs while in progress
- [ ] Lead Results page refreshes automatically when an Apify run transitions to completed

## Blocked by

- #0018 — Apify Lead Sources: LeadSource Protocol + Google Places Adapter Refactor
- #0021 — Apify Lead Sources: Budget Settings
