# ADR 0012 — Team Member Roster for Deal Assignment, Not Per-User Accounts

**Status:** Accepted
**Date:** 2026-08-18

## Context

The CRM Pipeline feature needs to assign Deals to whoever is working them — LeadPro now has 2 appointment setters plus sales, so "who owns this deal" is a real, no-longer-hypothetical need. [0006-single-shared-password-auth.md](0006-single-shared-password-auth.md) deliberately kept LeadPro on a single shared login with no `users` table, since the tool has only 1–2 trusted operators and per-user accounts would add a login/registration/password-hashing surface the tool doesn't otherwise need.

Two options were considered:
- **Full per-user accounts** — a `users` table with individual credentials, superseding ADR 0006, so each operator logs in as themselves and deals are assigned by user ID.
- **Team Member roster** — a small `team_members` table (name + avatar initials/color, no credentials, no login) that `Deal.assignee_id` points to, layered on top of the existing shared-password auth rather than replacing it.

## Decision

Add a **Team Member roster**, not per-user accounts. `Team Member` records identify a person for assignment purposes only — they never authenticate and are unrelated to the shared `AUTH_PASSWORD` login. ADR 0006 stands unchanged: there is still exactly one shared login for the app.

## Reasons

- Assignment (who's working this deal) and authentication (who's allowed in the app) are separate concerns. The team needed the former, not the latter.
- A roster table is trivial: add/rename/deactivate a person via a simple settings page, no invite flow, no password reset, no session management.
- Free-text "assigned to" was rejected because it fragments filtering and per-column totals on the Kanban board (name drift like "Sarah" vs "sarah" vs "Sarah K.").

## Consequences

- There is still no way to restrict what any operator can see or do inside the app, and no audit trail of which real person performed a given action in the browser — assignment is a label on a Deal, not an access boundary. If LeadPro ever needs to restrict access per person (not just label ownership), that is the trigger to revisit ADR 0006 and introduce real per-user accounts, at which point `team_members` likely merges into `users`.
