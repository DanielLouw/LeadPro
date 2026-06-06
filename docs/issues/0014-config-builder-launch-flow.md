# 0014 — Config Builder Launch Flow

**Type:** AFK
**Blocked by:** None

## Parent

https://github.com/DanielLouw/LeadPro/issues/1

## What to build

Streamline the Config Builder into a self-contained launch pad. The user builds their config, gets the cost estimate inline, confirms, and is automatically navigated to the Lead Results page once the run is submitted. The "Load Config" section is removed entirely.

The flow on the Config Builder page becomes:
1. User selects business types and cities, sets max results cap
2. Clicks "Run" — the app fetches the cost estimate and displays it inline (query count, estimated results, estimated cost in USD)
3. User clicks "Confirm & start run" — the run is submitted to the backend
4. App navigates automatically to the Lead Results page with the new run pre-selected and progress polling already active

On the Lead Results side: when navigated to from Config Builder after a run is submitted, the new run's ID is passed via React Router state so Lead Results can auto-select it immediately.

Use the `tdd` skill to drive implementation.

## Acceptance criteria

- [ ] "Load Config" section (textarea + button) is removed from the Config Builder
- [ ] A "Run" button on the Config Builder fetches the cost estimate and displays it inline on the same page
- [ ] The estimate shows: number of queries, estimated total results, estimated cost in USD
- [ ] A "Confirm & start run" button submits the run to the backend
- [ ] After confirmation, the app navigates automatically to the Lead Results page
- [ ] On arrival, the Lead Results page auto-selects the newly created run and begins progress polling
- [ ] A "Cancel" option is available at the estimate step to return to editing
- [ ] Frontend tests cover: Run button triggers estimate display, Confirm submits and navigates, Load Config section absent, Lead Results auto-selects run from router state

## Blocked by

None — can start immediately.
