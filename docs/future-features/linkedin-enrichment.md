# Future Feature: LinkedIn Enrichment

## Intent
Add LinkedIn as a data source to enrich Leads with company size, industry classification, and named decision-maker contacts (owner, founder, marketing manager).

## Why deferred
For MVP, the target is US-based local service businesses (plumbers, dentists, HVAC, etc.) which are poorly represented on LinkedIn. The scraping complexity (session cookies, rate limits, aggressive blocking) is high relative to expected yield for this segment.

## When to revisit
When the ICP expands upmarket toward businesses with 20+ employees or B2B service companies, where LinkedIn presence is more consistent.

## Scope when built
- Enrich existing Leads post-scrape (not a primary discovery source)
- Extract: company page size, decision-maker name + title
- Requires a logged-in LinkedIn session cookie — will need human intervention periodically
