# 0010 — CSV Export

**Type:** AFK
**Blocked by:** #0007

## What to build

Allow the user to export the currently filtered lead list to a CSV file. The export should reflect whatever filters and sort are active at the time — what you see is what you export.

## Acceptance criteria

- [ ] An "Export CSV" button is visible on the Lead Results page
- [ ] Clicking it downloads a CSV of the currently filtered and sorted lead list
- [ ] CSV includes all fields: business name, address, phone, email, Gap Score, gap signal labels, status, notes
- [ ] Gap signals are represented as a readable comma-separated string within the cell (e.g. "No HTTPS, Missing meta description")
- [ ] Export respects active filters — excluded leads are not in the CSV
- [ ] Empty notes fields export as blank (not "None" or "null")
- [ ] `GET /runs/:id/leads/export` endpoint returns a CSV response with correct Content-Type and Content-Disposition headers
- [ ] API test covers: export with filters applied, export with no leads, CSV field completeness

## Blocked by

#0007 — Lead Detail Panel + Status Workflow + Notes
