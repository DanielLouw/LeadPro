# 0009 — Gap Analyzer: Soft Signals

**Type:** AFK
**Blocked by:** #0002

## What to build

Extend the `gap_analyzer` module with soft gap signal detection. Soft signals contribute to a lead's Gap Score but do not on their own qualify a business as a Lead (that requires at least one hard signal).

**Soft signals to detect:**
- Missing meta title or description
- No sitemap.xml (404 or missing)
- No robots.txt (404 or missing)
- No schema markup (no JSON-LD or microdata detected in HTML)
- No mobile viewport meta tag

## Acceptance criteria

- [ ] All five soft signals are detected and returned in the Gap Signal list with correct severity (`soft`)
- [ ] Soft signals add to Gap Score at a lower weight than hard signals
- [ ] A business with only soft signals and no hard signals still scores 0 for hard-signal qualification — it would be excluded from the Lead set by the pipeline filter
- [ ] Plain-English descriptions are defined for each soft signal
- [ ] Unit tests cover each soft signal: present, absent, and edge cases (malformed HTML, missing HEAD section)
- [ ] Existing hard-signal tests continue to pass (no regression)

## Blocked by

#0002 — Gap Analyzer: Hard Signals
