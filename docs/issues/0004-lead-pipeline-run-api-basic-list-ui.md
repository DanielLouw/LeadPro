# 0004 — Lead Pipeline + Run API + Basic Lead List UI

**Type:** AFK
**Blocked by:** #0002, #0003

## What to build

Wire together the `places_scraper` and `gap_analyzer` into the `lead_pipeline` module. The pipeline accepts a Search Config, executes all queries, analyzes each business's website, applies the hard-signal gap filter (discarding businesses with no Gap Signals), scores and ranks the results, and persists everything to SQLite.

Expose two FastAPI endpoints: one to trigger a Run and one to fetch ranked Leads for a Run. Build a basic React Lead Results page that calls these endpoints and renders a ranked list.

This slice delivers the first end-to-end demoable path: config → run → see ranked leads.

## Acceptance criteria

- [ ] `lead_pipeline` accepts a Search Config, runs all queries concurrently, analyzes websites, filters out businesses with no hard gap signals, and persists the Run and its Leads to SQLite
- [ ] Website analysis is performed concurrently (async) per lead; a single unreachable website does not abort the run
- [ ] `POST /runs` triggers a run from a Search Config payload and returns a Run ID
- [ ] `GET /runs/:id/leads` returns leads for a run, sorted by Gap Score descending
- [ ] Each lead in the response includes: name, city/state, phone, website URL, Gap Score, and top gap signal labels
- [ ] Lead Status defaults to `new` for all leads created by the pipeline
- [ ] React Lead Results page renders the ranked lead list showing name, city/state, phone, and top gap signals per lead
- [ ] Integration tests cover: leads are created and ranked correctly, businesses with no hard signals are excluded, run is persisted, a failed website fetch does not crash the run
- [ ] API tests cover: POST /runs, GET /runs/:id/leads — using FastAPI TestClient with all external calls mocked

## Blocked by

#0002 — Gap Analyzer: Hard Signals
#0003 — Places Scraper
