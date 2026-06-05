# 0001 — Project Scaffold & DB Schema

**Type:** HITL
**Status:** Complete — merged to master (commit `6d56276`)
**Blocked by:** None — can start immediately

## What to build

Set up the full project structure for LeadPro: Python/FastAPI backend, React frontend, SQLite database, and dev tooling. Define the database schema for all core entities. This is the foundation every other slice builds on.

The user should review and approve the scaffold structure before subsequent slices begin.

## Acceptance criteria

- [x] Python backend bootstrapped with FastAPI, organised into `gap_analyzer`, `places_scraper`, `lead_pipeline`, and `api` modules
- [x] React frontend scaffolded with a dev server and basic routing (Config Builder page, Lead Results page)
- [x] SQLite database initialised with schema covering: Runs, Leads, Gap Signals, Notes, Lead Status
- [x] Lead Status values (`new`, `reviewing`, `contacted`, `pass`) defined and enforced at the schema level
- [x] Gap Score stored as a numeric field on Lead; gap signals stored as a related table (not a blob) for forward compatibility
- [x] `.env.example` present documenting required API keys (Google Places, PageSpeed Insights)
- [x] `README.md` documents how to install dependencies and start both backend and frontend locally
- [x] Backend and frontend start successfully with a single command each

## Blocked by

None — can start immediately
