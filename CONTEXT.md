# LeadPro — Domain Glossary

## Lead
A US-based local business returned by a scraping run that has passed the gap filter — i.e. it has at least one hard Gap Signal. Businesses with no detectable gap are excluded from the pipeline.

## Gap Signal
A detectable technical deficiency in a business's web presence that indicates a service opportunity. Hard gap signals qualify a business as a Lead. Soft signals contribute to the Gap Score but do not qualify alone. Each signal maps to exactly one Service.

**Hard gap signals (any one qualifies the business as a Lead):**
- No website → Website Build
- Website is broken or parked → Website Build
- No HTTPS → Website Build
- Mobile PageSpeed score below 50 → Website Modernisation

**Soft gap signals (add to Gap Score only):**
- Missing meta title or description → SEO Package
- No sitemap.xml → SEO Package
- No robots.txt → SEO Package
- No schema markup → SEO Package
- No mobile viewport tag → Website Modernisation
- Slow LCP (Largest Contentful Paint > 4s) → Website Modernisation
- High CLS (Cumulative Layout Shift > 0.25) → Website Modernisation
- Slow INP (Interaction to Next Paint > 500ms) → Website Modernisation
- No og:image Open Graph tag → SEO Package
- No analytics detected (no GA4, GTM, or known third-party snippet) → SEO Package
- Non-standard analytics detected (e.g. Plausible, Hotjar — GA4/GTM absent) → SEO Package
- Missing H1 tag → SEO Package
- No image alt text (≥3 images, none have alt attributes) → SEO Package

## Service
A fixed category of work the user sells to a Lead, derived from that Lead's Gap Signals. Each Gap Signal maps to exactly one Service. The catalogue:
- **Website Build** — for businesses with no website, a broken/parked site, or no HTTPS
- **Website Modernisation** — for businesses whose site is slow, fails Core Web Vitals, or lacks mobile fundamentals
- **SEO Package** — for businesses whose site is invisible to search engines, lacks social sharing metadata, has no analytics instrumentation, or has structural on-page SEO gaps

## Gap Score
A numerical ranking assigned to a Lead based on the severity and number of Gap Signals detected. Higher score = more obvious problems = higher priority for outreach. Hard signals are weighted above soft signals.

## Contact Record
The minimum viable data captured per Lead: business name, phone number, address. Email is captured as best-effort. A named decision-maker is a future enhancement.

## Lead Source
The system responsible for supplying raw business records to the pipeline. Each Run has exactly one Lead Source. Supported sources:
- **Google Places API** — queries the Google Places Text Search API using free-text query strings
- **Apify Google Maps Scraper** — runs the `compass/crawler-google-places` actor on Apify
- **Apify Facebook Pages Scraper** — runs the `apify/facebook-pages-scraper` actor on Apify

Each Lead Source is implemented as an adapter in a curated registry. Adding a new source requires a new adapter — arbitrary actor IDs with custom field mappings are not supported.

## External ID
The source's native identifier for a business, stored on every Lead. Unique per Run. For Google Places and Apify Google Maps Scraper runs this is the Google `placeId`. For Apify Facebook Pages Scraper runs this is the Facebook page ID.

## Search Term
One keyword variant used to query a Lead Source for a given business category. A single business type (e.g. "Plumbers") maps to one or more Search Terms (e.g. "plumbers", "plumbing contractors", "drain repair"). The set of Search Terms per business type is system-maintained in a data file — users do not edit them directly.

## Search Slot
The atomic unit of search work: a unique `(state, county, search term)` combination. Each Search Slot tracks a search count (how many times it has been queued in a Run) and the last run that used it. The pipeline always selects the least-used Search Slots first, cycling round-robin once all slots for a given state+industry have been visited at least once. Default slots per Run: 3. Each slot yields up to 50 results, so a standard Run scrapes up to 150 businesses. Slots are created lazily in the DB the first time a `(state, business type)` combination is run — all counties × all search terms for that combination are upserted at once.

## Slot Saturation
The state reached when all Search Slots for a given `(state, business type)` combination have been visited at least once. At that point the pipeline continues cycling (picking the lowest-count slots), but every result is potentially a duplicate. Surfacing a saturation alert to the user is a planned future enhancement.

## Search Config
A YAML document that drives a Run. Contains a `source` key identifying the Lead Source, a `max_results_per_run` cap, and a `source_config` block whose keys depend on the chosen Lead Source and mode. Not exposed to the user for direct editing — generated entirely by the Config Builder.

For Google Places cycling mode: `source_config` contains `industry` (business type label), `state` (US state abbreviation), and `slots_per_run` (number of Search Slots to use). The pipeline selects the specific counties at execution time.

For Google Places legacy mode: `source_config` contains a `queries` list of raw query strings. Still supported for backward compatibility with existing Run rows.

## Config Builder
A dashboard page where the user selects a Lead Source, one or more business types from a curated chip grid, and a US state, then launches a Run. For Google Places, selecting multiple business types creates one Run per type — each Run cycles independently through Search Slots for that business type in the chosen state. The user reviews the combined cost estimate and remaining monthly budget before confirming. YAML is never shown to the user.

## Run
A single manual execution of the scraping pipeline against one Lead Source, driven by a Search Config. The user triggers a Run, reviews the resulting Leads in the dashboard, and makes outreach decisions.

## Run Tracker
A persistent dashboard widget showing how much of each monthly source budget has been consumed in the current billing month. Displays spend and remaining budget separately for Google Places and Apify. Budget limits are user-configurable via Budget Settings.

## Budget Settings
User-editable monthly spend limits per source group: one limit for Google Places API and one shared limit for all Apify actors. Defaulting to $200.00 (Google Places) and $5.00 (Apify). Updated by the user when their plan changes — no redeployment required.

## Lead Status
A user-assigned state on a Lead after review. Tracks the user's outreach workflow.
Values: `new` → `reviewing` → `contacted` | `pass`
