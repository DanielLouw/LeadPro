# 0007 — Lead Detail Panel + Status Workflow + Notes

**Type:** AFK
**Blocked by:** #0004

## What to build

Add a slide-out detail panel to the Lead Results page. Clicking any lead opens the panel showing full lead information, all Gap Signals with plain-English descriptions, direct links to the business website and Google Maps listing, contact details, a status selector, and a private notes field.

Status changes and notes are persisted immediately via the API.

## Acceptance criteria

- [ ] Clicking a lead in the list opens a slide-out detail panel without navigating away
- [ ] Detail panel shows: business name, full address, phone number, email (if found), Gap Score
- [ ] All detected Gap Signals are listed with plain-English descriptions (e.g. "No HTTPS — this site is not secure")
- [ ] Direct link to the business website opens in a new tab
- [ ] Direct link to the business Google Maps listing opens in a new tab
- [ ] Status selector shows current status and allows changing to any valid status: `new`, `reviewing`, `contacted`, `pass`
- [ ] Status change is persisted immediately via `PATCH /leads/:id/status`
- [ ] Notes field is editable free text; changes are saved on blur or explicit save action via `PATCH /leads/:id/notes`
- [ ] Panel can be closed without losing list scroll position
- [ ] API tests cover: PATCH /leads/:id/status, PATCH /leads/:id/notes — valid transitions, invalid status values rejected

## Blocked by

#0004 — Lead Pipeline + Run API + Basic Lead List UI
