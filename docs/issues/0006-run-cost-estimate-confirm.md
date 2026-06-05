# 0006 — Run Cost Estimate & Confirm Step

**Type:** AFK
**Blocked by:** #0004, #0005

## What to build

Before a Run executes, show the user an estimated Google Places API cost based on the number of queries in their Search Config and the max results cap. Require a confirmation step before the run starts. Enforce the max results cap during execution.

The default max results cap is 500 per run. The user can raise or lower it in the Config Builder.

## Acceptance criteria

- [ ] Config Builder exposes a max results cap field, defaulting to 500
- [ ] Max results cap is included in the generated Search Config YAML
- [ ] Before triggering a run, the dashboard displays: number of queries, estimated total results, estimated API cost in USD
- [ ] A confirmation dialog or step requires explicit user action before the run is submitted to the backend
- [ ] The pipeline enforces the max results cap — total results across all queries in a run never exceed the cap
- [ ] Cost estimate uses the current Google Places Text Search pricing (configurable constant, not hardcoded magic number)
- [ ] API test covers: cap is enforced when pipeline would otherwise exceed it

## Blocked by

#0004 — Lead Pipeline + Run API + Basic Lead List UI
#0005 — Config Builder UI
