# PRD — Apify Lead Sources Integration

## Problem Statement

LeadPro currently has a single lead source: the Google Places API. This creates two problems for the user. First, the Google Places API is the most expensive way to discover local businesses at scale ($16 per 500-result run), meaning the monthly $200 free credit evaporates quickly as usage grows. Second, restricting discovery to one source means entire categories of businesses — those with a strong Facebook presence but no Google Maps listing — are invisible to the pipeline. The user has no way to diversify their lead discovery or control spend across sources.

There is also no visibility into how much of each monthly API budget has been consumed, making it easy to accidentally exhaust a budget mid-session.

## Solution

Introduce a multi-source lead pipeline with a curated registry of Lead Sources. The user selects a source when building a Run config, and the pipeline dispatches to the appropriate adapter. Two Apify actors join the existing Google Places API as supported sources: the Apify Google Maps Scraper ($4/1,000 on free plan vs $32/1,000 for Google Places) and the Apify Facebook Pages Scraper ($10/1,000), which surfaces businesses with Facebook presence but no Google Maps listing.

A persistent Run Tracker widget shows monthly spend vs budget for each source group. A Settings page lets the user update budget limits when they upgrade their plan. The Config Builder is refactored to support source selection and a more compact business type picker.

## User Stories

1. As a user, I want to select which lead source to use when building a Run config, so that I can choose the right source for my prospecting goal.
2. As a user, I want to run the Apify Google Maps Scraper as a lead source, so that I can discover businesses at a lower cost per result than the Google Places API.
3. As a user, I want to run the Apify Facebook Pages Scraper as a lead source, so that I can find businesses that have a Facebook presence but may lack a website.
4. As a user, I want each Run to use exactly one lead source, so that I know where each Lead came from and can attribute cost correctly.
5. As a user, I want a source selector dropdown at the top of the Config Builder, so that the form adapts to show the right input fields for my chosen source.
6. As a user, I want business types displayed as a compact chip grid instead of a long checkbox list, so that I can see and select all options without scrolling.
7. As a user, I want to see an estimated cost and remaining monthly budget before confirming an Apify run, so that I can make an informed decision about whether to proceed.
8. As a user, I want the pre-run cost estimate to show how much budget will remain after the run, so that I can plan my remaining runs for the month.
9. As a user, I want a Run Tracker widget on the dashboard, so that I can see at a glance how much of my monthly Google Places and Apify budgets I have consumed.
10. As a user, I want the Run Tracker to show spend and remaining budget separately for Google Places and Apify, so that I understand my exposure in each billing system.
11. As a user, I want to configure my monthly budget limits for Google Places and Apify in a Settings page, so that the tracker stays accurate when I upgrade my plan.
12. As a user, I want budget limits to default to $200/month for Google Places and $5/month for Apify, so that the tracker is accurate out of the box for free-plan users.
13. As a user, I want the default max results per run to be 10, so that I conserve my Apify free-plan budget during testing.
14. As a user, I want to see descriptive status messages while an Apify run is in progress (e.g. "Waiting for Apify to start…", "Apify is scraping — this usually takes 1–3 minutes"), so that I know the app is working and not frozen.
15. As a user, I want the Lead Results page to update when an Apify run completes, so that I can immediately review my new leads.
16. As a user, I want Leads discovered via Apify to go through the same gap analysis pipeline as Google Places leads, so that gap scores and signals are consistent regardless of source.
17. As a user, I want each Lead to carry a traceable External ID from its source (Google place ID, Facebook page ID), so that duplicate businesses within a run are deduplicated correctly.
18. As a user, I want existing Google Places runs to be unaffected by this change, so that my historical data and workflow remain intact.

## Implementation Decisions

### LeadSource Protocol
A `LeadSource` Python Protocol defines the contract all source adapters must satisfy. It has a single async method that accepts a `source_config` dict and `max_results` integer and returns a list of `RawBusiness` records. The pipeline dispatches to adapters via a registry keyed on the `source` column value. Adding a new source requires a new adapter class and a registry entry — arbitrary Apify actor IDs with user-defined field mappings are explicitly out of scope (see ADR 0001).

### RawBusiness and External ID
`RawBusiness` gains an `external_id` field (replacing `place_id`) and a `source` field. The `Lead.place_id` column is renamed to `external_id` via Alembic migration. The unique constraint on `(run_id, place_id)` becomes `(run_id, external_id)`. Each adapter is responsible for populating `external_id` from its native identifier (`placeId` for both Google sources, Facebook page ID for the Facebook adapter).

### Run Schema Changes
The `Run` model gains two new columns:
- `source: VARCHAR(50) NOT NULL` — enforced by a DB check constraint listing valid source keys; existing rows backfilled as `google_places`
- `apify_run_id: VARCHAR(255) NULLABLE` — stores the Apify actor run ID for in-progress Apify runs; null for Google Places runs

The `source` column is the authoritative source-of-truth for pipeline dispatch. The `source` key in `config_yaml` is redundant once the column exists and the pipeline reads from the DB row.

### Search Config YAML Shape
The YAML document has two top-level sections: shared run parameters and a nested `source_config` block. Shared parameters: `source`, `max_results_per_run` (default: 10). The `source_config` block is passed as an opaque dict to the matching adapter. Example for Apify Google Maps:

```yaml
source: apify_google_maps
max_results_per_run: 10
source_config:
  search_term: plumbers
  city: Austin
  state: TX
```

Legacy Google Places configs (pre-migration) carry their `queries` list at the top level with no `source_config` nesting. The pipeline handles both shapes during a transition period.

### Apify Adapter Polling Model
Apify runs are asynchronous — the adapter POSTs to the Apify API, receives an actor `runId`, then polls `GET /actor-runs/{runId}` on a short interval until the run status is `SUCCEEDED` or a terminal failure state. The `apify_run_id` is written to the `Run` row immediately after the POST so that the UI can surface it if needed. Dataset items are fetched from `GET /datasets/{datasetId}/items` after the run succeeds and mapped to `RawBusiness` records. All of this happens inside the existing FastAPI background task — no separate polling loop is introduced.

The `apify-client` PyPI package is used for all Apify API calls.

### Apify Status Messages
A new `apify_status: VARCHAR(100) NULLABLE` column on `Run` carries a short human-readable status string updated by the background task at key transition points: `"Queued on Apify"`, `"Apify is scraping — this usually takes 1–3 minutes"`, `"Downloading results"`. The UI polls this field and renders it in place of the progress bar for Apify runs.

### Settings Table
A new `Settings` table with a single row holds user-editable budget limits:
- `google_places_monthly_budget_usd: FLOAT` — default 200.00
- `apify_monthly_budget_usd: FLOAT` — default 5.00

The application reads this row on startup and exposes it via a REST endpoint. The Settings page in the frontend allows the user to update both values.

### Run Tracker
The Run Tracker is a persistent widget (dashboard header or sidebar) that aggregates `cost_usd` from all `Run` rows in the current calendar month, grouped by source type (`google_places` vs `apify_*`). Apify cost is calculated at run completion as `total_leads × rate_per_result` for the actor used. Google Places cost uses the existing per-request formula. The tracker displays: source label, amount spent this month, amount remaining vs the budget limit from Settings.

### Cost Per Result Rates
Fixed constants in the application config:
- Google Places API: $0.032 per request (20 results/request → ~$0.0016/result)
- Apify Google Maps Scraper: $0.004 per result
- Apify Facebook Pages Scraper: $0.010 per result

### Config Builder Refactor
The source selector is a dropdown at the top of the Config Builder. Selecting a source reshapes the form below it: Google Places shows the existing query builder; Apify sources show a search term input and city/state geo fields. Business types are rendered as a chip/badge grid (flex-wrap, 4 columns) replacing the current vertical checkbox lists. The cost estimate confirm step shows estimated cost + remaining monthly budget for the selected source.

### APIFY_API_KEY Configuration
A new `APIFY_API_KEY` environment variable is added to `config.py` and `.env`. It is required when the source is an Apify actor; the pipeline raises a clear error at run start if it is absent for an Apify run.

## Testing Decisions

Good tests assert external behaviour — what the system returns or persists — not how it gets there. Tests should not reach into adapter internals or assert on intermediate polling calls.

### What makes a good test here
- Assert that given a mocked Apify API response, the adapter returns correctly shaped `RawBusiness` records with the right `external_id` and `source` values.
- Assert that given a fixed list of `RawBusiness`, `execute_run()` persists the expected `Lead` and `GapSignal` rows regardless of source.
- Assert that cost estimation functions return the correct dollar amounts for each source/result-count combination.
- Assert that the Run Tracker aggregation returns the correct spend for a given set of Run rows.

### Modules to test
- **LeadSource adapters** — mocked HTTP (via `pytest-httpx` or `respx`), asserting `RawBusiness` output shape and `external_id` population for both Apify adapters
- **Pipeline dispatch** — mock adapter returns fixed `RawBusiness` list; assert DB state after `execute_run()` completes; existing pattern in the codebase
- **Cost estimation** — pure function unit tests, no mocking required
- **Run Tracker aggregation** — in-memory SQLite with seeded `Run` rows across billing months; assert correct per-source totals
- **Settings CRUD** — in-memory SQLite; assert read/write of budget limits

### Prior art
Existing pipeline tests mock `scrape_queries()` and assert on persisted `Lead` rows. The same pattern applies to the refactored pipeline with a mocked adapter.

## Out of Scope

- **Generic actor runner** — allowing the user to provide any Apify actor ID with a custom field-mapping config. Explicitly excluded per ADR 0001.
- **Webhook-based Apify result delivery** — Apify can push results via webhook instead of polling. Excluded because it requires a publicly reachable URL, which breaks local development.
- **LinkedIn enrichment** — documented as a future feature in `docs/future-features/linkedin-enrichment.md`. Not a primary discovery source and out of scope for this integration.
- **Instagram Scraper** — evaluated and excluded: does not reliably return phone number or physical address, which are required fields for a Contact Record.
- **Cross-source deduplication** — deduplicating a business that appears in both a Google Maps run and a Facebook Pages run. Each run is independent; deduplication within a run (by `external_id`) is in scope, cross-run deduplication is not.
- **Restart recovery for Apify polling** — if the server restarts while an Apify run is in progress, the run will be stuck in `running` state. Excluded given the single-user nature of the app and the low likelihood of interruption.
- **Yellow Pages Scraper** — evaluated and excluded: does not return the business's own website URL, which is required to run gap analysis.

## Further Notes

- The free Apify plan provides $5/month of credit, resetting each billing cycle. At the default 10 results/run, this covers ~125 Google Maps runs or ~50 Facebook Pages runs per month.
- The Google Places API provides $200/month of free credit, also resetting monthly. At 10 results/run the cost is ~$0.016/run — effectively unlimited for personal use.
- When the user upgrades to an Apify paid plan, they only need to update the `apify_monthly_budget_usd` value in Settings. No code changes or redeployment required.
- The `apify-client` Python package should be pinned in `requirements.txt` to avoid breaking changes from Apify SDK updates.
- Both Apify actors are third-party (not published by Apify): `compass/crawler-google-places` and `apify/facebook-pages-scraper`. Their output schemas should be validated defensively in each adapter.
