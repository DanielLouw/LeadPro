# 0008 — Lead List Filters, Sort & Run Progress

**Type:** AFK
**Blocked by:** #0004

## What to build

Enhance the Lead Results page with filtering, sorting, a run summary, and a live progress indicator during an active run.

## Acceptance criteria

- [ ] Filter by gap signal type (multi-select): shows only leads that have the selected signal(s)
- [ ] Filter by status (multi-select): shows only leads with the selected status value(s)
- [ ] Sort by: Gap Score (default, descending), business name (A–Z), city (A–Z)
- [ ] Summary row at the top of the results shows: total leads in current filter, breakdown count by top gap signal type
- [ ] While a run is executing, a progress indicator shows: queries completed / total, leads found so far
- [ ] Progress updates without requiring a full page refresh (polling or server-sent events)
- [ ] Filters and sort state persist across detail panel open/close interactions
- [ ] API supports filtering and sorting via query params on `GET /runs/:id/leads`

## Blocked by

#0004 — Lead Pipeline + Run API + Basic Lead List UI
