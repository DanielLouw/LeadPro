# 0010 — CSV Export

**Type:** AFK
**Blocked by:** #0007

## What to build

Allow the user to export the currently filtered lead list to a CSV file. The export should reflect whatever filters and sort are active at the time — what you see is what you export.

## Acceptance criteria

- [x] An "Export CSV" button is visible on the Lead Results page
- [x] Clicking it downloads a CSV of the currently filtered and sorted lead list
- [x] CSV includes all fields: business name, address, phone, email, Gap Score, gap signal labels, status, notes
- [x] Gap signals are represented as a readable comma-separated string within the cell (e.g. "No HTTPS, Missing meta description")
- [x] Export respects active filters — excluded leads are not in the CSV
- [x] Empty notes fields export as blank (not "None" or "null")
- [x] `GET /runs/:id/leads/export` endpoint returns a CSV response with correct Content-Type and Content-Disposition headers
- [x] API test covers: export with filters applied, export with no leads, CSV field completeness

## Extended — All Leads export (added 2026-06-18)

- [x] "Export CSV" button also added to All Leads page, matching Lead Results button style exactly (`btn btn-secondary`, `apiFetch` → blob → anchor, `exportingCsv` loading state)
- [x] `GET /api/leads/export` endpoint accepts same filter params as `GET /api/leads/` (`states`, `statuses`, `signal_types`, `search`, `sort`) and streams a CSV with the same columns
- [x] Export URL is built from current active filter state — what you see is what you export
- [x] API tests cover: content-type, disposition, all filter params, empty result

## Blocked by

#0007 — Lead Detail Panel + Status Workflow + Notes
