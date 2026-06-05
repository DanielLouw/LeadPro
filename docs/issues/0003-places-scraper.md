# 0003 — Places Scraper

**Type:** AFK
**Blocked by:** #0001

## What to build

Implement the `places_scraper` module. It accepts a query string (e.g. "plumbers in Austin TX") and a max results cap, calls the Google Places Text Search API, and returns a list of raw business records.

Each business record contains: name, address, phone number, website URL (if present), Google Maps URL, and Google Place ID. The module handles API errors gracefully and enforces the results cap.

## Acceptance criteria

- [ ] `places_scraper` accepts a query string and max results cap, returns a list of raw business records
- [ ] Each business record contains: name, formatted address, phone number, website URL (nullable), Google Maps URL, Place ID
- [ ] Results are capped at the configured maximum — no overfetching
- [ ] API errors (quota exceeded, invalid key, network failure) are caught and surfaced as a structured error, not an unhandled exception
- [ ] Empty result sets are handled gracefully (returns empty list, no error)
- [ ] Unit tests cover: successful result set, empty results, result cap enforcement, API error
- [ ] No real network calls in tests — Google Places responses use fixture JSON

## Blocked by

#0001 — Project Scaffold & DB Schema
