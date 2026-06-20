# Lead Verification Research

Research into how to verify lead contact data is accurate and actionable, prioritised by cost (free first).

> Tier 0 decisions made 2026-06-20. Tier 1+ still TBD.

---

## Guiding principle

Run cheap/free checks first. Gate paid checks on leads that passed free checks. Only run expensive checks on leads you're about to contact.

---

## Tier 0 — Free, at ingest (every lead)

### 1. Google Places `businessStatus`

**What it does:** The Places API already returns `businessStatus` on every result. Values: `OPERATIONAL`, `CLOSED_TEMPORARILY`, `CLOSED_PERMANENTLY`.

**Implementation:** Add `business_status` to the `fields` requested in `_fetch_details`. Filter out `CLOSED_PERMANENTLY` in `_fetch_query` before constructing `RawBusiness` — the business is dropped before it ever reaches gap analysis, saving a network call.

**Caveats:** Data can be 6–18 months stale for small businesses. A recently closed business may still show `OPERATIONAL`.

- Cost: $0 (`business_status` is a Basic Data field — same billing tier as `formatted_phone_number` and `website`)
- Accuracy: Moderate — catches obvious closures, misses recent ones
- Complexity: Trivial
- **Viability: Build it**

---

### 2. Phone format validation

**What it does:** Validates that the phone number returned by Google Places is a well-formed US number.

**Caveats:** Google Places phone data is clean for US businesses in practice. The hit rate on genuinely malformed numbers is near-zero, making the effort unjustifiable. Format validity also does not confirm an active line.

- Cost: $0
- Accuracy: High for format; does not confirm active status
- Complexity: Trivial
- **Viability: Skip — low real-world hit rate for this data source. Revisit if dirty phone data is observed in production.**

---

### 3. Detect "Social URL as website"

**What it does:** Many businesses enter their Facebook, Instagram, or Yelp page URL as their "website" in Google Maps. These are not real websites. The gap analyzer currently treats these as live websites (they return HTTP 200), so the business gets no `no_website` signal — a false negative.

**Implementation:** This is a gap signal fix, not a data quality filter. Add a new hard gap signal `social_as_website` → Website Build to the gap analyzer. Before fetching the URL, check if it belongs to a known social/directory domain (`facebook.com`, `instagram.com`, `twitter.com`, `yelp.com`, `linkedin.com`, `nextdoor.com`). If so, emit `social_as_website` and skip the HTTP fetch entirely.

- Cost: $0
- Accuracy: High — exact domain match
- Complexity: Trivial
- **Viability: Build it — fixes a real false-negative in the current gap signal system**

---

## Tier 1 — Free technical checks (all qualified leads)

### 4. Website liveness check (HTTP HEAD)

**What it does:** Confirms the website URL actually loads and is not parked, broken, or redirecting to a parking service.

**Implementation:**
```python
import httpx
r = httpx.head("https://example.com", follow_redirects=True, timeout=10)
# Check: r.status_code, final r.url, Content-Type
```

What to look for:
- Status 200 = live
- 404/500 / connection error = dead
- Final redirect to `godaddy.com`, `sedo.com`, `parkingcrew.com`, `hugedomains.com`, `dan.com` = parked domain
- Redirect to a social URL = no real website

Known parking redirect domains to detect: GoDaddy, Sedo, ParkingCrew, HugeDomains, DAN, Afternic, Bodis, Uniregistry.

- Cost: $0
- Accuracy: High — directly observable
- Complexity: Trivial
- Note: **Highest ROI verification step.** Immediately reveals dead sites, parked pages, and FB-as-website, all of which are core scoring signals.
- **Viability:** TBD

---

### 5. DNS MX record check

**What it does:** Checks whether the business domain has mail servers configured. No MX records = no domain-based email exists for this business. Gates all email finding steps.

**Implementation:** `dnspython` library.
```python
import dns.resolver
answers = dns.resolver.resolve("example.com", "MX")
```

- Cost: $0
- Accuracy: High — authoritative DNS result
- Complexity: Trivial
- **Viability:** TBD

---

### 6. Website contact page email scrape

**What it does:** Fetches the business website (or its `/contact` page) and extracts any email addresses listed in the content or footer. For small businesses that publish their email on their site, this is more reliable than any API-based email finding tool.

**Implementation:** `requests` or `httpx` to fetch, `BeautifulSoup4` to parse, regex to extract email patterns.

**Caveats:** Many businesses obfuscate emails (e.g. `info [at] business [dot] com`) to avoid spam bots. Some use contact forms only. Expected hit rate: 30–50% of businesses with a real website.

- Cost: $0
- Accuracy: High when found (it's their own published address)
- Complexity: Low–moderate (handle obfuscation, multiple pages)
- **Viability:** TBD

---

### 7. SSL certificate check (crt.sh)

**What it does:** Queries Certificate Transparency logs to check if the domain has a valid, recently-renewed SSL certificate. No recent SSL = neglected or parked site (useful scoring signal).

**Implementation:** Free JSON API, no API key required.
```
GET https://crt.sh/?q=example.com&output=json
```
Python library: `pycrtsh`.

Signals:
- Has an SSL cert = real hosted site
- Cert recently renewed (last 90 days) = actively maintained
- No cert = security warning on the site (scoring negative)

- Cost: $0
- Accuracy: High — Certificate Transparency logs are authoritative
- Complexity: Trivial
- **Viability:** TBD

---

### 8. Domain age check (WHOIS / RDAP)

**What it does:** Looks up when the domain was first registered and when it expires.

**Implementation:** `python-whois` library, or RDAP (modern JSON successor to WHOIS) via `rdap.org`.

Useful signals:
- Domain age < 12 months → new/unestablished business
- Expiring within 30 days → at risk of going dark
- Domain age 5+ years → established web presence (positive signal)

**Caveats:** WHOIS parsing is inconsistent across registrars. RDAP is cleaner but not all registrars support it yet.

- Cost: $0 (rate limits apply at scale)
- Accuracy: Moderate (parsing inconsistency)
- Complexity: Low–moderate
- **Viability:** TBD

---

### 9. Tech stack detection (open-source Wappalyzer)

**What it does:** Detects what CMS / platform the business website is built on, from HTTP response headers and page HTML.

**Implementation:** `python-Wappalyzer` library (uses open-source Wappalyzer fingerprint rules).

**Why it matters for LeadPro:** A business on a modern stack (Shopify, Squarespace, custom React) is a worse lead for a web-building pitch than one on a neglected 2015 WordPress install or no site at all.

**Caveats:** The open-source Wappalyzer ruleset stopped updating in 2023 — misses newer tools but still catches 80%+ of major platforms (WordPress, Wix, Squarespace, Shopify, Weebly).

- Cost: $0
- Accuracy: ~80% for major platforms; lower for newer/niche tools
- Complexity: Low
- **Viability:** TBD

---

## Tier 2 — Low-cost paid (leads you're about to contact)

### 10. Hunter.io email finding

**What it does:** Given a domain, searches for email addresses associated with it and returns them with confidence scores.

**Free tier:** 25 domain searches + 50 verifications/month.
**Paid:** From $49/month (~$0.004/search).

**Realistic accuracy for local SMBs:** Hunter is built for B2B/corporate domains. For a plumber or hair salon, it typically returns only `info@domain.com` or nothing — rarely the owner's direct email. Expected useful hit rate: 20–30% for this lead type.

**When to use:** Only after MX check (step 5) confirms the domain supports email. Use free credits first.

- Cost: 25 free/month, then ~$0.004/search
- Accuracy: ~60–70% deliverable for SMB emails (vs. 91% for enterprise)
- Complexity: Trivial (REST API)
- **Viability:** TBD

---

### 11. Email verification (NeverBounce / Bouncer)

**What it does:** Verifies that a found email address is deliverable — checks MX, SMTP handshake, and known invalid/disposable lists.

**Options:**
- **NeverBounce:** ~$0.003–$0.008/credit, 1,000 credits included on signup
- **Bouncer:** ~$0.003/credit, often 30–40% cheaper than NeverBounce/ZeroBounce
- **ZeroBounce:** 100 free/month, ~$0.008/credit after

**When to use:** Only on emails you actually found (from step 6 or 10). Don't verify addresses you haven't found first.

- Cost: ~$0.003/credit (Bouncer), free tier available
- Accuracy: High (industry benchmarks ~95%+)
- Complexity: Trivial (REST API)
- **Viability:** TBD

---

### 12. Phone number lookup (Telnyx)

**What it does:** Given a phone number, returns carrier, line type (landline / mobile / VoIP / toll-free), and CNAM (caller ID name registered to the number).

**Why Telnyx over Twilio:** Telnyx charges ~$0.005/lookup (carrier + line type + CNAM combined) vs. Twilio's $0.008–$0.01.

**What the data enables:**
- Line type = mobile → can send SMS outreach
- CNAM returns business name → confirms number actually belongs to this business
- Disconnected number → strong signal business has closed (cheaper than an SOS check)

**NumVerify / AbstractAPI alternatives:** Cheaper but ~71–76% catch rate vs. Telnyx/Twilio's 90%+. Not recommended for production.

- Cost: ~$0.005/lookup (Telnyx)
- Accuracy: High — Telnyx has direct carrier relationships
- Complexity: Trivial (REST API)
- **Viability:** TBD

---

## Tier 3 — Selective paid (top-scored leads only)

### 13. Secretary of State business registry (OpenSOSData)

**What it does:** Checks state business registries to confirm a business is formally registered and active (not dissolved/revoked).

**Provider:** OpenSOSData — $0.0314/lookup, covers 30+ states (expanding).

**When it's useful:**
- Business name contains "LLC", "Inc.", "Corp." — these are formally incorporated and will appear in state records
- Sole proprietors / DBAs often aren't registered at the state level → low hit rate, skip

**Expected match rate:** 40–60% for local service businesses (many are informal sole proprietors).

- Cost: $0.031/lookup (OpenSOSData); 20 free trial lookups on Cobalt Intelligence
- Accuracy: Real-time from state sources when matched
- Complexity: Low (REST API)
- **Viability:** TBD

---

## Approaches ruled out (for now)

| Approach | Reason |
|---|---|
| SMTP probing (RCPT TO) | Datacenter IPs blocked by Gmail/M365; ~30% of domains are catch-all; blocklist risk at scale |
| LinkedIn company page check | Aggressive anti-bot; no reliable free lookup; <20% coverage for local SMBs |
| Instagram/Facebook discovery | Meta API requires app review; scraping risky; low signal value for local service businesses |
| BBB lookup | No public API; scraping against ToS; low coverage for micro-businesses |
| Data Axle / D&B enrichment | Enterprise pricing only; overkill for this use case |
| Wappalyzer paid API / BuiltWith | $295–$450/month; open-source ruleset covers our needs |

---

## Cost summary

| Scenario | Cost per lead |
|---|---|
| Tier 0 + 1 only (all free checks) | $0 |
| + Phone lookup (Telnyx) | ~$0.005 |
| + Email find + verify | ~$0.007–$0.015 |
| + Both phone and email | ~$0.012–$0.020 |
| + SOS registry check | +$0.031 |
| Top-scored lead, all checks | ~$0.05 |

Blended cost at scale (Tier 3 reserved for top 20% of leads): **~$0.01–$0.02/lead**.

---

## Open questions

- Which of these signals should feed into the lead score vs. just being displayed as metadata?
- Should verification run at ingest time (background job) or on-demand when a lead is opened?
- What's the right threshold for "this lead is worth running Tier 2 checks on"?
