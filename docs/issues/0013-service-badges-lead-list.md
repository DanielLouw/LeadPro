# 0013 — Service Badges on Lead List

**Type:** AFK
**Blocked by:** #0011

## Parent

https://github.com/DanielLouw/LeadPro/issues/1

## What to build

Show colour-coded service badges on each lead row in the Lead Results list. Each badge represents a unique service that applies to that lead (Website Build, Website Modernisation, SEO Package), derived from the lead's gap signals. This lets the user scan the list and immediately see what they would be pitching before clicking into a lead.

Each service gets a distinct, consistent colour across the whole app:
- Website Build — one colour (e.g. red/orange — signals urgency)
- Website Modernisation — one colour (e.g. amber — signals improvement)
- SEO Package — one colour (e.g. blue/green — signals growth)

A lead with signals spanning multiple services shows one badge per service (deduplicated).

Use the `tdd` skill to drive implementation.

## Acceptance criteria

- [ ] Each lead row in the list shows a badge for each distinct service its gap signals map to
- [ ] Badges are deduplicated — if a lead has three SEO signals, only one SEO Package badge appears
- [ ] Each service has a distinct colour, consistent across all rows
- [ ] Badges are legible at a glance (readable label, sufficient contrast)
- [ ] Frontend tests cover: correct badge(s) render per lead, deduplication, correct service label text

## Blocked by

#0011 — Gap Signal API Enrichment (service field must be in the API response first)
