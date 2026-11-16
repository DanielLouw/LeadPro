# ADR 0016 — Enrichment Runs Outside the Deployed App and Enters by Import

**Status:** Accepted
**Date:** 2026-11-16

## Context

Finding a Lead's Decision Maker and email addresses is done today by a local tool (`sandbox/enrichment/`) that reads each Lead's website with a local LLM on a workstation GPU. The deployed backend has no GPU, so that tool cannot simply be moved into it. Campaigns need its output on the Lead.

Options considered:
- **Hosted LLM inside the backend** — fully in-app, but a per-lead cost on every Lead with a website, for a step whose yield is low (about a quarter of enriched Leads ended up with a usable email).
- **Paid enrichment provider (Hunter, Clay)** — already assessed in `docs/future-features/` as weak for local trades businesses, and also per-lead cost.
- **Keep Enrichment local; import its results** — no per-lead cost, already working.

## Decision

Enrichment stays **outside the deployed app**. LeadPro exports Leads with their Lead ID, the local tool carries that ID through, and LeadPro **imports** the results file, matching rows to Leads **by Lead ID only**. Rows whose ID is unknown are rejected and reported, never matched by name or website.

## Reasons

- Zero marginal cost for a low-yield step, on hardware that is already owned.
- The data model (Decision Maker, Outreach Address) is the same whichever way the data arrives, so a hosted or provider-based Enrichment can replace the import later without changing it.
- ID-only matching makes a wrong attachment impossible; matching by name or domain was tried by hand and needed manual correction.

## Consequences

- The backend has no enrichment code path. Anyone reading it will find Decision Maker fields with no producer other than the import and manual edits — that is deliberate.
- Enrichment is a manual round trip (export, run locally, import) and only works from the machine with the GPU.
- The import file's columns are a contract between the sandbox tool and the backend; changing either side means changing both.
- Revisit if campaign volume makes the round trip a bottleneck, or if email yield needs a provider waterfall to improve.
