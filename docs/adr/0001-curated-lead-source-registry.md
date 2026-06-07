# ADR 0001 — Curated Lead Source Registry over Generic Actor Mapper

**Status:** Accepted  
**Date:** 2026-06-07

## Context

LeadPro needs to support multiple external scraping sources (Google Places API, Apify Google Maps Scraper, Apify Facebook Pages Scraper) with more planned (LinkedIn enrichment). Each source has a different API, different input shape, and different output field names.

Two architectural approaches were considered for accommodating multiple sources:

**Option A — Curated registry:** LeadPro ships with a fixed set of supported Lead Sources. Each source has a hand-written adapter that maps its specific output fields to the shared `RawBusiness` type. Adding a new source requires a new adapter class and a registry entry — no architecture change, but a code change.

**Option B — Generic actor mapper:** The user provides any Apify actor ID and a field-mapping config (e.g. `"title" → "name"`, `"phone" → "phone"`). LeadPro runs it and maps the output dynamically. Any actor works without a code change, but the mapping is on the user to configure and maintain.

## Decision

Use a **curated registry (Option A)**.

## Reasons

- Different actors return wildly different schemas, nested objects, and optional fields. A generic mapper would be brittle and push data-quality responsibility onto the user.
- The set of actors that serve LeadPro's ICP (US local service businesses) is small and stable. There is no meaningful long tail to support.
- Each adapter owns its own validation — field presence, type coercion, ID extraction — ensuring consistent `RawBusiness` quality regardless of source.
- A curated registry is still fully extensible: one new adapter class + one registry entry per source, with no changes to the pipeline or protocol.

## Consequences

- Every new Lead Source requires a code change and a new adapter. This is an intentional gate — it ensures data quality is reviewed before a source is shipped.
- The `LeadSource` protocol defines the contract all adapters must satisfy, making sources independently testable.
- Generic "run any Apify actor by ID" capability is explicitly out of scope and should not be added without revisiting this decision.
