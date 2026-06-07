# 0022 — Apify Lead Sources: Run Tracker Widget

## What to build

A persistent dashboard widget that shows the user how much of their monthly Google Places and Apify budgets have been consumed, and how much remains. This gives the user real-time awareness of their free-plan headroom before launching a run.

**Backend — monthly spend endpoint:**
- `GET /runs/monthly-spend` — returns current calendar month spend and remaining budget for each source group:
```json
{
  "google_places": {
    "spent_usd": 0.48,
    "budget_usd": 200.00,
    "remaining_usd": 199.52
  },
  "apify": {
    "spent_usd": 1.20,
    "budget_usd": 5.00,
    "remaining_usd": 3.80
  }
}
```
Uses `get_monthly_spend()` from #0021 and reads budget limits from the `Settings` row.

**Frontend — Run Tracker widget:**
- Persistent widget visible on the dashboard (header bar or sidebar — consistent placement across all pages)
- Shows two rows: one for Google Places, one for Apify
- Each row: source label, progress bar (spent / budget), dollar amounts ("$1.20 of $5.00 used")
- Apify row turns amber when spend exceeds 75% of budget; red when exceeded
- Widget polls `GET /runs/monthly-spend` on a reasonable interval (suggested: every 30 seconds while the dashboard is open) or refreshes after each run completes
- Shows "—" gracefully if no runs have been completed this month

## Acceptance criteria

- [ ] `GET /runs/monthly-spend` returns correct spend and remaining values for the current calendar month
- [ ] Spend resets correctly at the start of a new calendar month (prior month runs excluded)
- [ ] Widget is visible on the dashboard and shows both source groups
- [ ] Apify row turns amber at >75% budget consumed, red when budget is exceeded
- [ ] Widget reflects updated spend after a run completes without requiring a full page reload
- [ ] Widget shows "—" or $0.00 spent when no runs have been completed this month
- [ ] Unit tests: `GET /runs/monthly-spend` with seeded Run rows across multiple months returns correct per-group totals

## Blocked by

- #0017 — Apify Lead Sources: Schema Foundation
- #0021 — Apify Lead Sources: Budget Settings
