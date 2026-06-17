# ADR 0007 — JWT Stored in localStorage over httpOnly Cookie

**Status:** Accepted  
**Date:** 2026-06-17

## Context

After a successful login the frontend receives a JWT and must store it for subsequent API requests. Two storage mechanisms were considered:

**Option A — localStorage:** The token is written to `localStorage` and read back on each request. Any JavaScript running on the page can access it, which means an XSS vulnerability could exfiltrate the token.

**Option B — httpOnly cookie:** The server sets a cookie with the `httpOnly` flag, making it inaccessible to JavaScript entirely. Eliminates the XSS token-theft risk but requires cookie handling on the backend, CSRF protection, and additional CORS configuration for cross-origin deployments.

## Decision

Store the JWT in **localStorage (Option A)**.

## Reasons

- LeadPro has no third-party scripts, no user-generated content, and no dynamic HTML injection. The XSS attack surface is negligible.
- localStorage keeps the implementation entirely in the frontend — no cookie middleware, no CSRF tokens, no `SameSite` policy tuning needed on the backend.
- The 1–2 users are trusted operators on controlled devices. The threat model does not include a malicious actor with code execution on the same browser session.

## Consequences

- If an XSS vulnerability were introduced, an attacker could steal the JWT from localStorage. This risk is consciously accepted given the controlled environment.
- If the threat model changes (e.g. the app gains user-generated content or third-party integrations), this decision should be revisited in favour of httpOnly cookies.
