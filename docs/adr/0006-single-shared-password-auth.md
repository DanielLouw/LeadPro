# ADR 0006 — Single Shared Password over Per-User Accounts

**Status:** Accepted  
**Date:** 2026-06-17

## Context

LeadPro is a personal tool used by 1–2 trusted operators. Adding authentication is required before public hosting so that the deployed URL cannot be discovered and used to trigger expensive Apify and Google Places API calls.

Two models were considered:

**Option A — Single shared password:** One `AUTH_PASSWORD` environment variable. All users log in with the same credential. The server returns a signed JWT on success. No user table required.

**Option B — Per-user accounts:** A `users` table with usernames and hashed passwords. Each user has their own credential and the server can revoke one user's access independently.

## Decision

Use a **single shared password (Option A)**.

## Reasons

- The tool has 1–2 users who are both trusted. There is no need to distinguish between them or revoke access for one while retaining it for another.
- No user table means no user management UI, no password hashing library, no account creation flow — significantly less code to maintain.
- Rotating the shared password or `AUTH_SECRET` is sufficient for any emergency revocation.

## Consequences

- There is no audit trail distinguishing which user performed an action.
- Revoking access for one user requires changing the shared password for all users.
- Moving to per-user accounts later would require a new `users` table, a migration, and a registration or seeding mechanism. This ADR should be revisited if the number of users grows beyond 2 or if independent revocation becomes necessary.
