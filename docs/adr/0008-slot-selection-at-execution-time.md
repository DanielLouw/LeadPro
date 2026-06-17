# ADR 0008 — Search Slot Selection at Pipeline Execution Time

**Status:** Accepted  
**Date:** 2026-06-17

## Context

The geographic cycling feature selects Search Slots — `(state, county, search term)` combinations — based on which have the lowest search count. The selection needs to happen at some point in the flow.

Two approaches were considered:

**Option A — Select at Config Builder time:** The Config Builder queries the DB, picks the N least-used slots, and bakes the resulting query strings directly into the Search Config YAML. The pipeline executes whatever queries are in the YAML.

**Option B — Select at pipeline execution time:** The Search Config stores intent (`industry`, `state`, `slots_per_run`). When the Run executes, the pipeline queries the DB for the least-used slots at that moment, generates the queries, runs the scraper, and increments slot counts on completion.

## Decision

Select Search Slots at **pipeline execution time (Option B)**.

## Reasons

- Selection based on real-time DB state ensures slot counts are always current. If two runs are created in quick succession for the same state+industry, Option A would pick identical slots for both.
- Slot counts should only increment after a run completes successfully. Baking slot assignments into the YAML at creation time would require a separate "reservation" mechanism to avoid double-selection.
- The Search Config correctly describes *intent* (search this state+industry with N slots), not a specific execution plan. Keeping counties out of the YAML makes configs reusable and human-readable.

## Consequences

- The pipeline must query `search_slots` at the start of execution, not at run creation time.
- Slot counts are incremented after the scrape completes, inside `execute_run()`.
- The confirm step in the Config Builder shows estimated cost based on `slots_per_run × max_results_per_slot` without knowing which specific counties will be used — this is acceptable.
