# 0020 — Apify Lead Sources: Apify Facebook Pages Scraper Adapter

## What to build

Implement the `ApifyFacebookPagesAdapter` — a full end-to-end vertical slice that lets a user trigger a Run with `source = apify_facebook_pages`, scrape via the Apify `apify/facebook-pages-scraper` actor, and receive persisted Leads with gap signals.

This slice follows the exact same polling model as the Google Maps adapter (#0019). The differences are the actor ID, the input shape, the output field mapping, and the cost rate.

**ApifyFacebookPagesAdapter:**
- Accepts `source_config` with keys: `query` (string — keyword + location, e.g. `"plumbers Austin Texas"`)
- Uses the same in-task async polling model as `ApifyGoogleMapsAdapter`: POST → write `apify_run_id` → poll with `apify_status` updates → fetch dataset on success
- Maps actor output to `RawBusiness`:
  - `external_id` ← Facebook page ID
  - `name` ← page title
  - `phone` ← contact phone (nullable)
  - `website_url` ← website field (nullable)
  - `address`, `city`, `state` ← address fields (nullable)
  - `maps_url` ← null (no Google Maps equivalent for Facebook sources)
- Validates actor output defensively — pages missing both `phone` and `website_url` are skipped (no useful lead data)
- At run completion, writes `run.cost_usd = total_leads * 0.010` (Apify Facebook Pages free-plan rate)

**`source_config` YAML shape:**
```yaml
source: apify_facebook_pages
max_results_per_run: 10
source_config:
  query: plumbers Austin Texas
```

**Note on gap analysis:** Facebook Pages leads without a `website_url` will trigger the "No website" hard gap signal automatically, qualifying them as Leads for the Website Build service. The gap analyzer already handles this case — no changes needed.

## Acceptance criteria

- [ ] `ApifyFacebookPagesAdapter` is registered in the adapter registry under `apify_facebook_pages`
- [ ] Triggering a Run with `source = apify_facebook_pages` reaches the Apify API and starts the correct actor
- [ ] `run.apify_run_id` and `run.apify_status` are written at each polling transition point
- [ ] Leads are persisted with gap signals on success; Facebook pages without a website correctly receive the "No website" hard gap signal
- [ ] Pages missing both phone and website are skipped gracefully
- [ ] `run.cost_usd` is written at completion using the Apify Facebook Pages rate
- [ ] `maps_url` is null for all leads from this source
- [ ] Unit tests: given mocked Apify API responses, adapter returns correctly shaped `RawBusiness` records with `external_id` populated from the Facebook page ID
- [ ] Unit test: pages with no phone and no website are excluded from the output

## Blocked by

- #0018 — Apify Lead Sources: LeadSource Protocol + Google Places Adapter Refactor
