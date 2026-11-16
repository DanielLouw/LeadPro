# LeadPro — Domain Glossary

## Lead
A US-based local business returned by a scraping run that has passed the gap filter — i.e. it has at least one hard Gap Signal. Businesses with no detectable gap are excluded from the pipeline. A business with a known Google review count below 10 is dropped before gap analysis even runs and can never become a Lead by any path — too new/unverified to be a viable sales target, regardless of what other signals it might have. Unknown review count (source doesn't report it) is not treated as an exclusion. Qualification happens once, at discovery: a Lead whose Gap Signals have all been fixed by the time of a later Re-verification remains a Lead, but has no Findings and so is not eligible for a Campaign.

## Gap Signal
A detectable technical deficiency in a business's web presence that indicates a service opportunity. Hard gap signals qualify a business as a Lead. Soft signals contribute to the Gap Score but do not qualify alone. Each signal maps to exactly one Service.

**Hard gap signals (any one qualifies the business as a Lead):**
- No website → Website Build
- Website is broken (HTTP error or network failure) → Website Build
- Website domain is parked (redirects to a domain registrar/parking service) → Website Build
- Social URL as website → Website Build
- No HTTPS → Website Build
- Mobile PageSpeed score below 50 → Website Modernisation
- Google review count between 10 and 50 (inclusive) — established but still building local search visibility → SEO Package

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
- **Website Build** — for businesses with no website, a broken site, a parked domain, a social URL used as a website, or no HTTPS
- **Website Modernisation** — for businesses whose site is slow, fails Core Web Vitals, or lacks mobile fundamentals
- **SEO Package** — for businesses whose site is invisible to search engines, lacks social sharing metadata, has no analytics instrumentation, or has structural on-page SEO gaps

## Gap Score
A numerical ranking assigned to a Lead based on the severity and number of Gap Signals detected. Higher score = more obvious problems = higher priority for outreach. Hard signals are weighted above soft signals.

## Contact Record
The minimum viable data captured per Lead: business name, phone number, address. Email is captured as best-effort and is the business's general address. The person to address is the Lead's Decision Maker, when one is known.

## Decision Maker
The one named person at a Lead's business that outreach is addressed to — typically the owner — with a name, a role and, when known, their own email address. A Lead has at most one. Supplied by Enrichment or entered by hand. A Decision Maker's name is **trusted** when Enrichment verified it against the business's own website or the user typed it in; only a trusted name is used to greet someone, and a name guessed from a mailbox address is never trusted.
_Avoid_: contact, owner, prospect

## Enrichment
The step that looks at a Lead's own website to find its Decision Maker and email addresses. Enrichment happens outside LeadPro and its results are brought in afterwards, attached to the Leads they were produced for. Distinct from a Lead Source, which discovers businesses rather than adding detail to ones already found.

## Outreach Address
The single email address a Lead would be emailed at: the Decision Maker's own address when there is one, otherwise the business's general address. It is either **direct** (belongs to a named person or is specific to that business) or a **generic inbox** (info@, office@ and similar). A Lead with no Outreach Address cannot be in a Campaign.

## Re-verification
Checking a Lead's website again to find out which of its Gap Signals are still true today, replacing the stored signals and Gap Score with the current result. Covers website-derived signals only; the Google review count is not re-checked and keeps the date of the Run that captured it.
_Avoid_: re-scan, refresh, re-run

## Finding
A Gap Signal restated as a sentence written for the business owner, describing the problem by its effect on their customers ("browsers label your site Not secure") rather than its technical cause. A Finding exists only while its Gap Signal is still true as of the last Re-verification; a review-count Finding additionally expires 90 days after the Run that captured the count. Not every Gap Signal has a Finding — signals an owner would not recognise as a problem (no sitemap, no robots.txt) have none. A Lead's Findings are ordered by how visible the problem is to the owner's customers, and the first one opens the email.
_Avoid_: issue, problem, pitch line

## Campaign
A named batch of Leads committed to one round of email outreach at the same time. LeadPro decides who is in a Campaign and what Findings are quoted to each; the email copy, sending and replies live in the outreach tool, not in LeadPro. A Campaign is permanent once confirmed — individual Leads can be removed from it, but the Campaign itself cannot be deleted.
_Avoid_: sequence, blast, export, pipeline

## Campaign Eligibility
The conditions a Lead must meet to be put in a Campaign: Lead Status is `new` or `reviewing`; it has an Outreach Address; it has at least one Finding; it has no match on the Do-Not-Contact List; and its business has no Outreach History in the last 90 days. The 90-day condition alone may be overridden by the user; the others may not.

## Outreach History
The record that a business was included in a Campaign, kept against the business's email address and website domain rather than against a Lead. Because the same business can be discovered again by a later Run as a different Lead, Outreach History is what stops it being emailed twice. Removing a Lead from a Campaign removes the Outreach History that Campaign created.

## Do-Not-Contact List
Email addresses and website domains that must never be put in a Campaign, because the recipient opted out, the address bounced, or the user decided so. An entry blocks its exact address and every address at the same domain — except where the domain is a shared email provider (gmail.com, yahoo.com and similar), in which case only the exact address is blocked. Like Outreach History, it belongs to the business, not to a Lead.
_Avoid_: suppression list, blacklist, unsubscribes

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
A user-assigned state on a Lead after review. Tracks the user's triage workflow within Lead Discovery — has this Lead been looked at, and is it worth pursuing at all. Distinct from Pipeline Stage, which only applies once a Lead becomes a Deal.
Values: `new` → `reviewing` → `contacted` | `pass`
A Lead becomes `contacted` when it is confirmed into a Campaign — the commitment to email it, not the moment the email is sent — and returns to `reviewing` if it is removed from that Campaign. Businesses that are not sales targets at all (suppliers, trade associations) are marked `pass` by the user.

## Lead Discovery
The part of the app where Leads are found (via scraping Runs), scored by Gap Signal, and triaged by Lead Status. Distinct from the Pipeline, which tracks Deals.

## Deal
A record tracked through the sales Pipeline, separate from a Lead. Created either by promoting an existing Lead into the Pipeline, or by adding a standalone Deal directly (manual entry or import) with no originating Lead. A Deal that did originate from a Lead keeps an optional reference back to it; standalone Deals have none.

## Pipeline
The part of the app where Deals are tracked through Pipeline Stages on a Kanban board, separate from Lead Discovery. A Deal belongs to exactly one of several Pipelines (e.g. Appointment Setting, Sales — see [0012](docs/adr/0012-team-member-roster-not-accounts.md) for how Deals are assigned within a Pipeline), each with its own ordered list of Pipeline Stages. Moving a Deal from one Pipeline to another is an explicit hand-off action, not a normal stage change.

## Team Member
A named person a Deal can be assigned to. Not a user account — Team Members have no login credentials and are unrelated to the app's single shared password (see [0012](docs/adr/0012-team-member-roster-not-accounts.md)). Managed via a simple roster (add/rename/deactivate), not a registration flow.

## Package
A bundled sales offering a Deal can be marked with — e.g. Starter, Growth, Complete (names and prices still being finalized). Distinct from Service: Service is a technical category mechanically derived from a Lead's Gap Signals in Lead Discovery; Package is what's actually being sold in the Pipeline, and is managed as editable rows (name + default price), not a fixed enum, since pricing is still in flux. A Deal's `amount` defaults from the selected Package's default price but is always hand-editable.
