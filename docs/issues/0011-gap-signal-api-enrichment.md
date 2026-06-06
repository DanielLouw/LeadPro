# 0011 — Gap Signal API Enrichment: service and sales_copy fields

**Type:** AFK
**Blocked by:** None

## Parent

https://github.com/DanielLouw/LeadPro/issues/1

## What to build

Add two new fields to every Gap Signal returned by the leads API: `service` (one of: `Website Build`, `Website Modernisation`, `SEO Package`) and `sales_copy` (sales-ready prose that explains the problem and frames the pitch).

The mapping is static and lives in the backend gap analyzer alongside the existing signal definitions — not stored in the database. The fields are computed from the signal type at serialisation time.

Signal to Service mapping:
- `no_website` → Website Build
- `broken_website` → Website Build
- `no_https` → Website Build
- `low_pagespeed` → Website Modernisation
- `no_viewport_tag` → Website Modernisation
- `missing_meta_title` → SEO Package
- `missing_meta_description` → SEO Package
- `no_sitemap` → SEO Package
- `no_robots_txt` → SEO Package
- `no_schema_markup` → SEO Package

Sales copy should be sales-ready — written from the perspective of someone about to call the business. It should explain why the gap hurts the business and frame the service as the fix. Example for `no_https`: "This site is flagged as 'Not Secure' by every modern browser, which kills trust and conversion rates before a visitor even reads the page. Frame the conversation around credibility and Google ranking — a full Website Build is the fix."

Use the `tdd` skill to drive implementation.

## Acceptance criteria

- [x] `GET /leads/run/:id` response includes `service` and `sales_copy` on every gap signal object
- [x] All 10 signal types map to the correct service value
- [x] `sales_copy` is non-empty, sales-ready prose for all 10 signal types
- [x] No database schema changes — fields are derived at serialisation time
- [x] API tests cover: correct `service` value per signal type, `sales_copy` non-empty for all signal types

## Blocked by

None — can start immediately.
