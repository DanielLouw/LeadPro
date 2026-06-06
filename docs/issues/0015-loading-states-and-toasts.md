# 0015 — Loading States and Toast Notifications

**Type:** AFK
**Blocked by:** None

## Parent

https://github.com/DanielLouw/LeadPro/issues/1

## What to build

Add loading feedback throughout the app so the user always knows when something is happening. Three mechanisms:

1. **Skeleton loader** — shown on the lead list while leads are being fetched. A fixed set of placeholder rows in the shape of the table, replacing the blank screen.
2. **Spinners + disabled states** — all buttons that trigger async actions show a loading indicator and become non-interactive while the action is in flight. Covers: Run / Confirm / Export CSV on Config Builder and Lead Results; status selector and notes save in the detail panel.
3. **Toast notifications** — a lightweight toast component (no third-party library) that auto-dismisses after 3 seconds. Shown for: status saved, notes saved, run submitted successfully. Toasts are an array of `{ id, message, type }` in component state.

Use the `tdd` skill to drive implementation.

## Acceptance criteria

- [x] Skeleton placeholder rows are shown in the lead list while leads are loading
- [x] Skeleton disappears and is replaced by real rows once data arrives
- [x] All async action buttons are disabled and show a spinner while in flight
- [x] A toast notification appears when a lead status is successfully saved
- [x] A toast notification appears when lead notes are successfully saved
- [x] A toast notification appears when a run is successfully submitted
- [x] Toasts auto-dismiss after 3 seconds
- [x] Multiple toasts can be queued without replacing each other
- [x] Frontend tests cover: skeleton renders while loading, buttons disabled during fetch, toast appears after status save, toast appears after notes save

## Blocked by

None — can start immediately.
