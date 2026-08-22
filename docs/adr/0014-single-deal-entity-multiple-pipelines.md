# ADR 0014 — One Deal Entity Spans Multiple Pipelines

**Status:** Accepted
**Date:** 2026-08-18

## Context

LeadPro needs two Kanban boards now (Appointment Setting, Sales) and a third (Onboarding) planned later. Appointment Setting ends at `qualified`; Sales begins at `discovery completed` — there's a hand-off point where a record crosses from one board to the other once a discovery call happens.

Two options were considered:
- **One `Deal` entity, multiple Pipelines** — `Deal` carries a `pipeline` field (`appointment_setting` | `sales` | future `onboarding`) and a `stage` field scoped to whichever pipeline it's currently in. Advancing from Appointment Setting to Sales is an explicit action that updates both fields on the same row.
- **Separate entity per board** — e.g. `Deal` and `Opportunity` as distinct tables, where qualifying in Appointment Setting spawns a new linked row in Sales.

## Decision

Use **one `Deal` entity with a `pipeline` + `stage` pair**, not separate entities per board.

## Reasons

- Every board tracks the same kind of thing (a prospect/deal with contact info, amount, package, assignee, notes) with a different stage vocabulary — not a different data shape. Two entity types would mean duplicating every shared field and stitching records together via a link to answer "what happened with this deal end-to-end."
- One record preserves one continuous stage-change history (see the `deal_stage_events` log) across the full lifecycle — Appointment Setting activity and Sales activity for the same prospect stay on one timeline instead of split across two linked rows.
- Directly supports the planned third board (Onboarding) as just another `pipeline` value with its own stage list on the same entity — no new table needed when that's built.
- The Appointment-Setting-to-Sales hand-off is a real, meaningful event (a discovery call happened) — modeling it as an explicit action that flips `pipeline` + `stage` together captures that moment accurately without requiring a data migration between tables.

## Consequences

- A Deal's `stage` value is only meaningful in the context of its current `pipeline` — code and UI must always read them together, never `stage` alone.
- Board queries filter by `pipeline`, not by table — `WHERE pipeline = 'sales'` rather than a separate `sales_deals` table.
