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

## Service
A fixed category of work the user sells to a Lead, derived from that Lead's Gap Signals. Each Gap Signal maps to exactly one Service. The catalogue:
- **Website Build** — for businesses with no website, a broken/parked site, or no HTTPS
- **Website Modernisation** — for businesses whose site is slow or lacks mobile fundamentals
- **SEO Package** — for businesses whose site is invisible to search engines

## Gap Score
A numerical ranking assigned to a Lead based on the severity and number of Gap Signals detected. Higher score = more obvious problems = higher priority for outreach. Hard signals are weighted above soft signals.

## Contact Record
The minimum viable data captured per Lead: business name, phone number, address. Email is captured as best-effort. A named decision-maker is a future enhancement.

## Search Config
A YAML file the user edits before each run, defining the Google Places queries to execute (business type + city combinations) and run parameters (max results per query). Generated via the Config Builder UI.

## Config Builder
A dashboard page where the user selects business types from a curated list and cities from a state → city picker, then launches a Run. Acts as the launch pad for the entire workflow: the user builds their config, reviews the cost estimate, confirms, and is automatically navigated to the Lead Results page once the Run is submitted.

## Run
A single manual execution of the scraping pipeline, driven by a Search Config. The user triggers a Run, reviews the resulting Leads in the dashboard, and makes outreach decisions.

## Lead Status
A user-assigned state on a Lead after review. Tracks the user's outreach workflow.
Values: `new` → `reviewing` → `contacted` | `pass`
