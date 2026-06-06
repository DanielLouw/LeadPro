# PRD — UI Polish & Gap Signal Enrichment

## Problem Statement

The app works functionally but feels unresponsive and hard to act on. Three specific pain points:

1. **No loading feedback.** After triggering any async action — starting a run, loading leads, saving a status — the UI goes silent. The user has no way to tell if the app is working or broken.
2. **Gap signals are technical, not actionable.** The detail panel lists signals like "No sitemap.xml found" but gives no context about what that means for the business or what service to pitch. The user has to translate raw signals into a sales angle themselves, every time.
3. **The Config Builder flow is disconnected and cluttered.** The "Load Config" section is dead weight, and the path from "build a config" to "start a run" requires too many manual steps (copy YAML, navigate, paste, estimate, confirm).

## Solution

- Add loading states (spinners, skeletons, toasts) so the user always knows the app is working.
- Enrich each Gap Signal with sales-ready copy and a Service label, shown in the detail panel and as colour-coded badges on the lead list.
- Streamline the Config Builder into a launch pad: estimate and confirm inline, then auto-navigate to Lead Results once the run is submitted. Remove the Load Config section.
- Apply a visual polish pass (spacing, typography, component consistency) using the `ckm:ui-styling` skill.

## User Stories

1. As a user, I want a spinner on the lead list while it loads, so that I know the app is fetching data and not frozen.
2. As a user, I want a skeleton placeholder in the shape of the lead list while the initial data loads, so that the layout doesn't jump when results arrive.
3. As a user, I want buttons to show a loading indicator and become disabled while an async action is in flight, so that I don't accidentally submit twice.
4. As a user, I want a toast notification when a lead status is saved, so that I get confirmation without having to look for visual changes.
5. As a user, I want a toast notification when lead notes are saved, so that I know my notes persisted.
6. As a user, I want a toast notification when a run is successfully submitted, so that I know the pipeline has started.
7. As a user, I want each gap signal in the detail panel to show a plain-English explanation of why it matters to the business, so that I understand the problem without needing technical knowledge.
8. As a user, I want each gap signal in the detail panel to show a sales-ready pitch angle, so that I know exactly how to frame the conversation when I call the lead.
9. As a user, I want each gap signal in the detail panel to show which Service it maps to (Website Build, Website Modernisation, or SEO Package), so that I can quickly identify what I'd be selling.
10. As a user, I want each lead row in the list to show a colour-coded service badge for each of its gap signals, so that I can scan the list and immediately see what I'd be pitching before clicking into a lead.
11. As a user, I want the service badges on the list to be visually distinct by service type, so that Website Build, Website Modernisation, and SEO Package are instantly distinguishable at a glance.
12. As a user, I want to click "Run" on the Config Builder and see the cost estimate appear inline on the same page, so that I don't have to navigate away and re-paste my config.
13. As a user, I want to confirm the run on the Config Builder and be automatically taken to the Lead Results page, so that I can watch progress without any extra navigation steps.
14. As a user, I want the "Load Config" section removed from the Config Builder, so that the page is focused and uncluttered.
15. As a user, I want the business type checkboxes to have proper spacing and a clean layout, so that I can scan and select types without squinting.
16. As a user, I want form controls (selects, inputs, textareas) to have consistent sizing and spacing throughout the app, so that it feels like a coherent product.
17. As a user, I want button styles to be consistent (primary, secondary, danger) across all pages, so that I always know what action is destructive or confirmatory.

## Implementation Decisions

- **Service catalogue is fixed at three values:** Website Build, Website Modernisation, SEO Package. Each Gap Signal maps to exactly one Service. The mapping lives in the backend gap analyzer alongside the existing signal definitions.
- **Signal enrichment fields added to the API response:** each gap signal object gains two new fields — `service` (one of the three catalogue values) and `sales_copy` (sales-ready prose). These are static, not stored in the DB — computed from the signal type at serialisation time.
- **No DB schema changes required** for gap signal enrichment — the new fields are derived constants, not persisted data.
- **Config Builder run flow state machine:** the existing `NewRunStep` state machine in LeadResults is replicated/moved to ConfigBuilder for the inline estimate → confirm flow. On confirm, the run is submitted and `useNavigate` sends the user to `/leads`.
- **LeadResults accepts an optional pre-selected run:** when navigated to from ConfigBuilder after a run is submitted, the new run's ID is passed via React Router state so LeadResults can auto-select it and start progress polling immediately.
- **Load Config section removed** from ConfigBuilder entirely — the `loadConfigText`, `loadError`, and `loadConfig()` function are deleted.
- **Toast system:** a lightweight local toast component (no third-party library) — an array of `{ id, message, type }` in component state, auto-dismissed after 3 seconds.
- **Skeleton loader:** shown on the lead list only (the longest wait). A fixed number of placeholder rows matching the table column structure.
- **UI styling pass** uses the `ckm:ui-styling` skill. All visual changes are style/className updates only — no behaviour or API changes.

## Testing Decisions

Good tests assert external behaviour at the highest available seam — they do not test implementation details like internal state or which CSS class is applied.

**Backend (FastAPI TestClient, in-memory SQLite — same pattern as `test_api_leads.py`):**
- `GET /leads/run/:id` response includes `service` and `sales_copy` on each gap signal object
- Each known signal type maps to the correct service value
- `sales_copy` is non-empty for all signal types

**Frontend Config Builder (`ConfigBuilder.test.tsx`):**
- Clicking "Run" with a valid config fetches `/runs/estimate` and renders the estimate
- Clicking "Confirm & start run" posts to `/runs/` and navigates to `/leads`
- "Load Config" section is not rendered

**Frontend Lead Results (`LeadResults.test.tsx`):**
- Skeleton rows are shown while leads are loading
- Service badges render on lead rows with the correct service label
- A toast appears after a successful status save
- A toast appears after a successful notes save

**Frontend Detail Panel (via `LeadResults.test.tsx`):**
- Clicking a lead opens the panel showing `sales_copy` for each signal
- Service name is displayed alongside each signal

## Out of Scope

- Adding new gap signal types
- Changing the Gap Score weighting
- Filtering leads by Service type (may be a future issue)
- Structural navigation changes beyond the Config Builder → Lead Results flow
- Any backend changes to how signals are detected

## Further Notes

- The `ckm:ui-styling` skill should be used for all styling issues. Issues covering visual layout changes should be explicitly marked to use this skill.
- The service catalogue (Website Build, Website Modernisation, SEO Package) is now documented in `CONTEXT.md` as a first-class domain term.
- Signal-to-service mapping and sales copy live in the backend gap analyzer — a single source of truth. The frontend receives them via the API and renders them without hardcoding.
