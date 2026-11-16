# ADR 0015 — Outreach History and Do-Not-Contact Keyed by Email and Domain, Not by Lead

**Status:** Accepted
**Date:** 2026-11-16

## Context

Campaigns need two protections: a business must not be emailed twice by accident, and a business that opted out or bounced must never be emailed again. The obvious place to record both is on the `Lead` — a `campaign_id` and a `do_not_contact` flag.

But a `Lead` is not a business. `(run_id, external_id)` is unique per Run, so the same business discovered by two Runs is two unrelated `Lead` rows. A flag on the first row says nothing about the second. A Do-Not-Contact entry can also arrive for an address LeadPro holds no Lead for at all (an opt-out pasted in from the outreach tool).

Options considered:
- **Flags on `Lead`** — simplest, but silently fails across Runs, which is exactly when double-emailing happens.
- **De-duplicate Leads into a `Business` entity** — correct, but a large change to Lead Discovery that this feature does not otherwise need.
- **Key the protections by email address and website domain** — independent of `Lead` rows.

## Decision

Outreach History and the Do-Not-Contact List are stored against **email address and website domain**, and Campaign Eligibility is decided by looking a Lead's Outreach Address and website domain up in them. Campaign membership still references the `Lead` (to know what was exported), but it is not what protects against repeat contact.

A Do-Not-Contact entry blocks its exact address and the whole domain, except when the domain is a shared email provider (gmail.com, yahoo.com, etc.), where only the exact address is blocked.

## Reasons

- It is correct across Runs without introducing business de-duplication.
- Opt-outs and bounces are facts about an address, and arrive from outside LeadPro keyed by address — they need somewhere to live even when no Lead matches.
- Domain-level blocking catches the common case of the same business reached at `info@` in one Run and `owner@` in another.

## Consequences

- "Was this Lead contacted?" is answered two ways: `Lead.status == contacted` for the row that was in the Campaign, and an Outreach History lookup for any other Lead of the same business. Eligibility must use the lookup, never the status alone.
- Two businesses that share a domain (franchise locations on one site) block each other. Accepted: emailing the same company twice is the worse error.
- A business that changes both its email and its domain is not recognised. Accepted as rare.
- If a `Business` entity is introduced later, these records move onto it and this ADR is superseded.
