# PRD: LeadPro MVP

## Problem Statement

As a provider of SEO and website building services targeting US local businesses, I have no systematic way to find companies that need my services most. Manually searching Google, checking websites one by one, and trying to assess SEO quality is slow, inconsistent, and doesn't scale. I need a way to efficiently identify businesses with obvious web presence problems, rank them by how badly they need help, and track my outreach decisions — all without paying for expensive lead databases.

## Solution

A locally-run lead generation tool with a web dashboard. The user configures a run by selecting business types and US cities via a Config Builder UI, which generates a Search Config. The tool queries Google Places for matching businesses, analyzes each business's website for gap signals, scores and ranks the resulting leads, and presents them in a reviewable dashboard. The user can click into any lead to see its gap breakdown, visit the website, and track their outreach status. When ready, they export filtered leads to CSV for outreach.

## User Stories

### Config Builder
1. As a user, I want to select one or more business types from a curated categorised list, so that I can target the niches most relevant to my services.
2. As a user, I want a free-text field as an escape hatch for business types not in the curated list, so that I'm not limited to predefined categories.
3. As a user, I want to select a US state and then pick from major cities within that state, so that I can target specific geographic markets without typing raw search strings.
4. As a user, I want to select multiple cities across multiple states in a single config, so that I can run broad or multi-market searches in one go.
5. As a user, I want to set a maximum results cap per run (defaulting to 500), so that I stay within my Google Places API free tier and avoid surprise billing.
6. As a user, I want to see an estimated API cost before executing a run, so that I can make an informed decision before committing.
7. As a user, I want a confirmation step before the run starts, so that I don't accidentally trigger a costly scrape.
8. As a user, I want the Config Builder to generate a YAML Search Config file from my selections, so that I can reuse, tweak, or version control configs across runs.
9. As a user, I want to be able to load a previously saved Search Config YAML into the Config Builder, so that I can repeat or modify past runs.

### Running the Pipeline
10. As a user, I want to manually trigger a run from the dashboard, so that I remain in control of when data is collected.
11. As a user, I want to see live progress while a run is executing (queries completed, leads found so far), so that I know the tool is working.
12. As a user, I want a run to complete without crashing if a single business's website is unreachable, so that one bad URL doesn't lose the whole batch.
13. As a user, I want each run's results to be saved persistently, so that I can return to review them later without re-running.

### Lead Results & Ranking
14. As a user, I want to see all leads from a run ranked by Gap Score (highest first), so that the most actionable leads surface at the top.
15. As a user, I want to see each lead's business name, city/state, phone number, and top gap signals in the list view, so that I can make a quick assessment without clicking in.
16. As a user, I want to filter the lead list by gap signal type (e.g. "No website", "No HTTPS"), so that I can focus on a specific opportunity type.
17. As a user, I want to filter leads by status (new, reviewing, contacted, pass), so that I can separate leads I've already processed from ones still to review.
18. As a user, I want to sort leads by Gap Score, business name, or city, so that I can browse the list in the order most useful to me at the time.
19. As a user, I want to see a summary at the top of the results (total leads, breakdown by top gap signal), so that I can quickly gauge the quality of a run.

### Lead Detail
20. As a user, I want to click a lead to open a detail panel, so that I can review full information without leaving the list.
21. As a user, I want the detail panel to show all detected gap signals with plain-English descriptions, so that I understand exactly what problems the business has.
22. As a user, I want a direct link to the business's website from the detail panel, so that I can visit it with one click.
23. As a user, I want a direct link to the business's Google Maps listing from the detail panel, so that I can verify the business and see reviews.
24. As a user, I want to see the business's address, phone number, and email (if found) in the detail panel, so that I have everything I need to reach out.
25. As a user, I want to add and edit a private text note on any lead, so that I can record research findings or personal observations.
26. As a user, I want to change a lead's status from the detail panel, so that I can update my workflow state while reviewing.

### Lead Status Workflow
27. As a user, I want every new lead to start with status `new`, so that I have a clear inbox of unreviewed leads after each run.
28. As a user, I want to move a lead to `reviewing` while I'm doing additional research, so that I can distinguish it from unstarted leads.
29. As a user, I want to mark a lead as `contacted` once I've reached out, so that I don't double-contact the same business.
30. As a user, I want to mark a lead as `pass` if it's not a fit, so that it's removed from my active working set.

### Export
31. As a user, I want to export the currently filtered lead list to CSV, so that I can import it into outreach tooling or share it.
32. As a user, I want the CSV to include business name, address, phone, email, Gap Score, gap signals, status, and notes, so that it's complete enough to act on without going back to the dashboard.

## Implementation Decisions

- **Stack:** Python (FastAPI) backend, React frontend, SQLite database. Chosen for pipeline suitability, low operational overhead, and zero infrastructure cost for a locally-run tool.

- **Google Places API** is the sole business discovery source for MVP. Queries are constructed from business type + city combinations defined in the Search Config. Results are fetched using the Places Text Search endpoint.

- **Website analysis** is performed per lead after Places data is collected. The analyzer fetches the business's website (if present) and checks for all defined gap signals. Google PageSpeed Insights API (free tier) is called for mobile performance scoring.

- **Gap Signals** are split into hard (qualify a business as a Lead) and soft (contribute to Gap Score only) as defined in CONTEXT.md. A business with no hard gap signal is discarded and never stored.

- **Gap Score** is a numeric value computed from weighted gap signals. Hard signals carry higher weight than soft signals. The exact weights are configurable and can be tuned post-MVP.

- **Search Config** is a YAML file with the following shape:
  ```yaml
  queries:
    - "plumbers in Austin TX"
    - "HVAC companies in Dallas TX"
  max_results_per_run: 500
  ```
  The Config Builder generates this file; it can also be hand-edited and loaded back into the UI.

- **SQLite** stores all Leads, Runs, and Notes persistently. Schema is designed for forward compatibility — new gap signal types and status values can be added without migrations breaking existing data.

- **Run concurrency:** website analysis is performed concurrently (async) per lead within a run to keep total runtime reasonable. External API calls (Places, PageSpeed) are rate-limited to avoid bans.

- **Lead Status** is a user-managed field. The pipeline never changes status automatically — only the user does, via the dashboard.

- **Four modules with defined seams:**
  - `gap_analyzer` — pure function: URL in, gap signals + score out
  - `places_scraper` — query string + config in, raw business records out
  - `lead_pipeline` — Search Config in, persisted ranked Leads out (orchestrates the two above)
  - `api` — FastAPI HTTP layer consumed by the React dashboard

## Testing Decisions

- **What makes a good test:** tests should exercise external behavior at the module boundary, not internal implementation. A good test says "given this input, I get this output" — not "this internal function was called."

- **`gap_analyzer`** — unit tested with fixture HTML/HTTP responses. No real network calls. Tests cover: no website, broken URL, missing HTTPS, low PageSpeed score, missing meta tags, etc. This is the highest-priority test surface.

- **`places_scraper`** — unit tested with mocked Google Places API responses. Tests cover: successful result set, empty results, API error handling, result cap enforcement.

- **`lead_pipeline`** — integration tested end-to-end with all external calls mocked (Places API + PageSpeed API + HTTP fetches). Tests verify: correct leads are created, hard-gap filter discards no-gap businesses, leads are ranked correctly, run is persisted.

- **`api`** — tested at the HTTP level using FastAPI's TestClient. Tests cover: triggering a run, fetching leads, updating lead status, adding a note, exporting CSV.

- **Dashboard UI** — not automatically tested in MVP. Too much churn at this stage.

## Out of Scope

- LinkedIn enrichment (decision-maker names, company size) — deferred, documented in `docs/future-features/linkedin-enrichment.md`
- Email discovery (Hunter.io or similar) — future enhancement
- Automated/scheduled runs — MVP is manual trigger only
- Multi-user support — single local user only
- Cloud hosting or deployment — runs locally
- Radius-based or zip code targeting — state → city picker is sufficient for MVP
- CRM integration — CSV export is the bridge to outreach tooling for now
- Named decision-maker contact finding

## Further Notes

- The Google Places API free tier provides $200/month credit, covering roughly 11,700 Text Search requests. At a default cap of 500 results per run, this comfortably supports multiple runs per day within the free tier at low scale.
- The PageSpeed Insights API is free with a Google API key (up to 25,000 requests/day).
- Website analysis will encounter a meaningful percentage of timeouts and unreachable domains — the pipeline must handle these gracefully and record the failure reason as a gap signal ("Website unreachable") rather than crashing.
- The curated business type list should be stored as a data file (not hardcoded) so it can be extended without a code change.
