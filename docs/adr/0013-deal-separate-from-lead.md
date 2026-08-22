# ADR 0013 — Deal as a Separate Entity from Lead

**Status:** Accepted
**Date:** 2026-08-18

## Context

The CRM Pipeline feature needs a record that flows through Kanban stages, carries deal-shaped data (amount, package, close date, assignee), and can originate either from a scraped `Lead` or from nothing at all (manual entry, CSV import). `Lead.run_id` is `NOT NULL` and `(run_id, external_id)` is uniquely constrained — every `Lead` today is required to belong to a scraping `Run`, which a manually-added or imported record does not have.

Two options were considered:
- **Extend `Lead`** — make `run_id` nullable, add pipeline/stage/amount/package/assignee columns directly to the `leads` table.
- **New `Deal` entity** — a separate table, with a nullable `lead_id` FK back to the originating `Lead` when one exists.

## Decision

Add a **separate `Deal` entity**, decoupled from `Lead`. A `Deal` may optionally reference the `Lead` it was promoted from via `lead_id`; standalone Deals (manual "Add Prospect" or import) have `lead_id = NULL`.

## Reasons

- `Lead` means "a scraped business with Gap Signals" throughout the codebase and glossary — retrofitting it to also carry deal-shaped fields (amount, package, close date) that only make sense once someone is actually being sold to would blur that meaning and leave those columns NULL for the majority of Leads that are never pursued.
- Lead Discovery and Pipeline are separate sections of the app by design (see [CONTEXT.md](../../CONTEXT.md)); giving them separate tables keeps that boundary real instead of aspirational.
- A `Lead` can spawn more than one `Deal` over its lifetime (e.g. re-engaging a past lead) — a 1:many relationship via FK models that naturally; a shared row could not represent two separate pipeline runs for the same Lead without inventing a second table anyway.
- Standalone Deals (import/manual) need to exist with no Lead at all — nullable `lead_id` handles this directly; making `Lead.run_id` nullable to support the same case would weaken a constraint that's otherwise meaningful everywhere else `Lead` is used.

## Consequences

- Reporting that spans both ("how many scraped Leads eventually became Deals") requires a join through `lead_id`, not a single-table query.
- Gap Signals stay on the Lead and are not duplicated onto the Deal — the Deal view links back to the Lead for that context rather than carrying its own copy.
