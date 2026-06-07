# 0019 — Apify Lead Sources: Apify Google Maps Scraper Adapter

## What to build

Implement the `ApifyGoogleMapsAdapter` — a full end-to-end vertical slice that lets a user trigger a Run with `source = apify_google_maps`, have LeadPro scrape via the Apify `compass/crawler-google-places` actor, and receive persisted Leads with gap signals, identical to a Google Places run.

**ApifyGoogleMapsAdapter:**
- Accepts `source_config` with keys: `search_term` (string), `city` (string), `state` (string)
- POSTs to the Apify API to start an actor run with the input JSON. Writes the returned `apify_run_id` to the `Run` row immediately.
- Polls `GET /actor-runs/{runId}` on a short interval (suggested: 10 seconds). Updates `run.apify_status` at each transition:
  - After POST succeeds: `"Queued on Apify"`
  - Once run status is `RUNNING`: `"Apify is scraping — this usually takes 1–3 minutes"`
  - Once status is `SUCCEEDED`, before dataset fetch: `"Downloading results"`
- On `SUCCEEDED`: fetches dataset items from `GET /datasets/{datasetId}/items`, maps each item to `RawBusiness` with `external_id = item['placeId']`
- On terminal failure (`FAILED`, `TIMED-OUT`, `ABORTED`): raises an exception with the Apify run status so the pipeline can mark the Run as failed
- Validates actor output defensively — missing or null fields on individual items are handled gracefully (skip the item, log a warning)

**Config:**
- `APIFY_API_KEY` added to `config.py` and `.env.example`. Pipeline raises a clear `ConfigurationError` at run start if the key is absent for an Apify run.
- `apify-client` PyPI package added to `requirements.txt` (pinned to a specific version)

**Cost tracking:**
- At run completion, writes `run.cost_usd = total_leads * 0.004` (Apify Google Maps free-plan rate)

**`source_config` YAML shape:**
```yaml
source: apify_google_maps
max_results_per_run: 10
source_config:
  search_term: plumbers
  city: Austin
  state: TX
```

## Acceptance criteria

- [ ] `ApifyGoogleMapsAdapter` is registered in the adapter registry under `apify_google_maps`
- [ ] Triggering a Run with `source = apify_google_maps` reaches the Apify API and starts an actor run
- [ ] `run.apify_run_id` is written to the DB immediately after the actor run is created
- [ ] `run.apify_status` is updated at each polling transition point
- [ ] On success, leads are persisted with gap signals exactly as they are for Google Places runs
- [ ] `run.cost_usd` is written at completion using the Apify Google Maps rate
- [ ] Missing `APIFY_API_KEY` raises a clear error before the run starts
- [ ] Actor output with missing/null fields is handled gracefully — the item is skipped, not a crash
- [ ] Unit tests: given mocked Apify API responses (start run → poll → succeeded → dataset items), adapter returns correctly shaped `RawBusiness` records with `external_id` populated from `placeId`
- [ ] Unit test: adapter raises on terminal Apify failure status

## Blocked by

- #0018 — Apify Lead Sources: LeadSource Protocol + Google Places Adapter Refactor
