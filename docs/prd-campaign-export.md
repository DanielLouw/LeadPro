# PRD: Campaigns — Decision Makers, Re-verification and Export for Outreach

## Problem Statement

LeadPro finds Leads and scores them by Gap Signal, but stops there. To actually email those Leads I have to leave the app and stitch things together by hand:

- The email addresses and owner names I get from Enrichment live in loose files on my machine. LeadPro has nowhere to put them, so I can't see or filter by them.
- Gap Signals describe a Lead's website as it was on the day of the Run. By the time I write to someone weeks later, many are no longer true — most stored "no HTTPS" signals turned out to be wrong when checked — and quoting a fixed problem to a business owner makes me look careless.
- Gap Signals are worded for me ("No schema markup (JSON-LD or microdata) found"), not for a contractor. I rewrite each one by hand before it can go in an email.
- Nothing records who I have already emailed. The same business can be discovered again by a later Run as a brand-new Lead, and nothing stops me emailing it twice — or emailing someone who asked me to stop.

## Solution

LeadPro becomes the place where a round of outreach is prepared, while sending stays in a dedicated outreach tool.

- I import Enrichment results and each Lead gains a Decision Maker and an Outreach Address that I can see, filter by and correct.
- I select Leads and choose "Export for outreach". LeadPro re-verifies any Lead whose website hasn't been checked in the last 7 days, then shows me a preview: who is included, who is skipped, and why.
- I name the Campaign and confirm. LeadPro gives me a CSV ready to upload to the outreach tool, with a greeting, a cleaned company name and ready-made opening and follow-up sentences built from each Lead's current Findings.
- Confirming marks those Leads `contacted` and records Outreach History against each business's email address and domain, so the same business is never included again by accident, whichever Run rediscovers it.
- A Do-Not-Contact List, filled by hand or from the outreach tool's unsubscribe and bounce export, permanently keeps addresses and domains out of every Campaign.

## User Stories

### Decision Makers and Enrichment import

1. As a LeadPro user, I want to export Leads with their Lead ID included, so that Enrichment results can be attached back to exactly the right Lead.
2. As a LeadPro user, I want to import an Enrichment results file, so that Decision Makers and email addresses found outside the app appear on my Leads.
3. As a LeadPro user, I want imported rows matched to Leads by Lead ID only, so that a result is never attached to the wrong business.
4. As a LeadPro user, I want rows with an unknown or missing Lead ID rejected and listed after the import, so that I know exactly what was not imported and why.
5. As a LeadPro user, I want an import summary (Leads updated, Decision Makers found, Outreach Addresses found, rows rejected), so that I can judge the yield of an Enrichment run.
6. As a LeadPro user, I want each Lead to hold at most one Decision Maker with a name, role and email, so that there is one clear person to address.
7. As a LeadPro user, I want the business's general email kept separately from the Decision Maker's own email, so that I still have a fallback when no personal address is known.
8. As a LeadPro user, I want malformed, URL-encoded and placeholder email addresses cleaned or discarded on import, so that junk never becomes an Outreach Address.
9. As a LeadPro user, I want re-importing a newer Enrichment file to update a Lead's Decision Maker, so that I can re-run Enrichment and refresh the data.
10. As a LeadPro user, I want a Decision Maker I entered by hand never overwritten by an import, so that my corrections survive.
11. As a LeadPro user, I want to see whether a Decision Maker's name is trusted, so that I know whether it will be used in a greeting.
12. As a LeadPro user, I want a name treated as trusted only when Enrichment verified it on the business's own website and it is not an obvious non-name ("Myself", "The founder", "John Doe"), so that no one is greeted with nonsense.
13. As a LeadPro user, I want names guessed from a mailbox address never used in a greeting, so that "Hi Feedback," is impossible.
14. As a LeadPro user, I want to add or correct a Lead's Decision Maker in the Lead detail panel, so that I can fix what Enrichment got wrong.
15. As a LeadPro user, I want a name I type in to always count as trusted, so that my correction takes effect immediately.
16. As a LeadPro user, I want to see each Lead's Outreach Address and whether it is direct or a generic inbox in the Lead list, so that I can judge reachability at a glance.
17. As a LeadPro user, I want to filter the Lead list to Leads that have an Outreach Address, so that I can quickly find who can be emailed.

### Re-verification

18. As a LeadPro user, I want to re-verify selected Leads, so that their Gap Signals reflect their websites today.
19. As a LeadPro user, I want Re-verification to replace the Lead's website-derived Gap Signals and recalculate its Gap Score, so that the Lead list ranks by current problems.
20. As a LeadPro user, I want to see when each Lead was last verified, so that I know how much to trust its signals.
21. As a LeadPro user, I want "no HTTPS" to mean that a visitor actually ends up on an unsecured page, so that sites which redirect to HTTPS are not flagged.
22. As a LeadPro user, I want a site that shows a browser certificate warning distinguished from a site that does not load at all, so that I describe the right problem to the owner.
23. As a LeadPro user, I want a site that refuses automated checks treated as "could not verify" rather than "broken", so that I never tell an owner their working site is down.
24. As a LeadPro user, I want a Lead whose website could not be verified to keep no website Findings, so that nothing unconfirmed is quoted.
25. As a LeadPro user, I want a Lead whose problems have all been fixed to stay in my list, so that I keep its history.
26. As a LeadPro user, I want such a Lead excluded from Campaigns without its Lead Status changing automatically, so that the decision to pass on it stays mine.
27. As a LeadPro user, I want the Google review count stored on the Lead with the date it was captured, so that its age is known.
28. As a LeadPro user, I want Re-verification to leave the review count and its date untouched, so that I am not charged for a fresh lookup per Lead.
29. As a LeadPro user, I want Re-verification to be fast enough to wait for, so that it can run as part of an export.

### Findings

30. As a LeadPro user, I want each Gap Signal an owner would recognise restated as a plain sentence about its effect on their customers, so that I never translate technical signals by hand.
31. As a LeadPro user, I want no Finding for signals an owner would not recognise as a problem (no sitemap, no robots.txt), so that emails stay credible.
32. As a LeadPro user, I want a Lead's Findings ordered by how visible the problem is to the owner's customers, so that the strongest point opens the email.
33. As a LeadPro user, I want the order to be: site down, certificate warning, no HTTPS, not mobile-ready, no page title, no search description, review count, schema markup — so that it matches what I agreed.
34. As a LeadPro user, I want a review-count Finding dropped once the count is more than 90 days old, so that I never quote a stale number.
35. As a LeadPro user, I want to see a Lead's current Findings in the Lead detail panel, so that I know what would be said to that business.
36. As a LeadPro user, I want Findings kept separate from the existing internal sales copy, so that my own talking points and the prospect-facing wording do not get mixed up.

### Preparing a Campaign

37. As a LeadPro user, I want to select Leads in the Lead list and choose "Export for outreach", so that building a Campaign starts from the Leads I am already reviewing.
38. As a LeadPro user, I want the export to re-verify any selected Lead not verified in the last 7 days before showing me anything, so that no email quotes a Finding older than a week.
39. As a LeadPro user, I want to see progress while Re-verification runs, so that I know the app is working.
40. As a LeadPro user, I want a preview listing every included Lead with its Outreach Address, greeting and opening Finding, so that I can sanity-check the batch before committing.
41. As a LeadPro user, I want the preview to list every skipped Lead with the reason, so that nothing is silently dropped.
42. As a LeadPro user, I want a Lead skipped when its Lead Status is `contacted` or `pass`, so that I only email Leads still under consideration.
43. As a LeadPro user, I want a Lead skipped when it has no Outreach Address, with a count of how many were skipped for that reason, so that the size of the email gap stays visible.
44. As a LeadPro user, I want a Lead skipped when it has no Findings, so that every email has something true and specific to say.
45. As a LeadPro user, I want a Lead skipped when its Outreach Address or website domain matches the Do-Not-Contact List, so that opt-outs are always honoured.
46. As a LeadPro user, I want a Lead skipped when its business has Outreach History in the last 90 days, so that nobody is emailed twice in quick succession.
47. As a LeadPro user, I want that 90-day check to recognise the same business discovered by a different Run, so that a duplicate Lead does not slip through.
48. As a LeadPro user, I want two selected Leads that share an Outreach Address or domain reduced to one in the same Campaign, so that one business gets one email.
49. As a LeadPro user, I want to override the 90-day rule for specific Leads in the preview, so that I can deliberately follow up with an old Campaign's non-responders.
50. As a LeadPro user, I want no way to override a Do-Not-Contact match, so that I cannot email someone who opted out even by mistake.
51. As a LeadPro user, I want Leads with a generic inbox included and flagged, so that I can reach businesses whose only address is info@ and treat them differently if I choose.
52. As a LeadPro user, I want to abandon the preview without anything being recorded, so that looking costs nothing.

### Confirming and the CSV

53. As a LeadPro user, I want to name the Campaign and add notes before confirming, so that I can recognise it later.
54. As a LeadPro user, I want confirming to create the Campaign, record its members, set them to `contacted` and record Outreach History in one step, so that the record cannot be half-written.
55. As a LeadPro user, I want the CSV to download on confirm, so that I can upload it straight to the outreach tool.
56. As a LeadPro user, I want to download a Campaign's CSV again later, identical to the first download, so that a lost file is not a problem.
57. As a LeadPro user, I want the CSV to include a ready-made greeting ("Hi Vladimir," or "Hi there,"), so that the email template needs no conditional logic.
58. As a LeadPro user, I want the CSV to include the company name with legal suffixes removed and shouting capitals normalised, so that it reads naturally mid-sentence.
59. As a LeadPro user, I want the CSV to include a complete opening sentence built from the Lead's first Finding, so that each email starts with something specific to that business.
60. As a LeadPro user, I want the CSV to include a complete follow-up sentence built from the second Finding, or a general line when there is only one, so that the second email also works for every Lead.
61. As a LeadPro user, I want the CSV to include the trade, city, state, website, domain and phone, so that I can use them as merge fields or for reference.
62. As a LeadPro user, I want the CSV to include all Findings and the Service they point to, so that I can answer a reply without opening LeadPro.
63. As a LeadPro user, I want the CSV to include whether the address is direct or a generic inbox, and the date the Findings were verified, so that I can segment and audit.
64. As a LeadPro user, I want the CSV columns to stay stable between Campaigns, so that my outreach tool's field mapping keeps working.

### Managing Campaigns

65. As a LeadPro user, I want a list of Campaigns with name, date and member count, so that I can see what outreach has gone out.
66. As a LeadPro user, I want to open a Campaign and see its members and what was said to each, so that I can answer "what did we tell them?".
67. As a LeadPro user, I want to see on a Lead which Campaign it was in, so that the history is visible where I review Leads.
68. As a LeadPro user, I want to remove a single Lead from a Campaign, so that I can undo a mistake.
69. As a LeadPro user, I want a removed Lead returned to `reviewing` and the Outreach History that Campaign created for it cleared, so that it is as if it was never included.
70. As a LeadPro user, I want no way to delete a whole Campaign, so that the record protecting me from double-emailing cannot be erased after the CSV has already been uploaded.
71. As a LeadPro user, I want to edit a Campaign's name and notes afterwards, so that I can record how it went.

### Do-Not-Contact List

72. As a LeadPro user, I want to add an email address or domain to the Do-Not-Contact List by hand, so that I can act on an opt-out immediately.
73. As a LeadPro user, I want to paste a list of addresses to add at once, so that I can clear a backlog quickly.
74. As a LeadPro user, I want to import the outreach tool's unsubscribe and bounce export, so that opt-outs recorded there reach LeadPro.
75. As a LeadPro user, I want each entry to carry a reason (opted out, bounced, manual) and the date added, so that I know why someone is blocked.
76. As a LeadPro user, I want an address entry to block every address at the same domain, so that a business that opted out at info@ is not emailed at owner@.
77. As a LeadPro user, I want that domain-wide block not applied to shared email providers (gmail.com, yahoo.com and similar), so that one opt-out does not block every Gmail user.
78. As a LeadPro user, I want to add an address LeadPro holds no Lead for, so that an opt-out is honoured if that business is discovered later.
79. As a LeadPro user, I want to view and search the Do-Not-Contact List, so that I can check whether someone is on it.
80. As a LeadPro user, I want to remove an entry I added by mistake, so that an error is not permanent.
81. As a LeadPro user, I want a Lead blocked by the Do-Not-Contact List to show that in the Lead detail panel, so that I understand why it never appears in a Campaign.

## Implementation Decisions

**Scope boundary**
- LeadPro ends at a downloaded CSV. There is no integration with any outreach tool's API in this work. Email copy, sending, warm-up, reply handling and open tracking belong to the outreach tool.
- Campaigns are email-only.
- Enrichment is not moved into the backend (ADR 0016). The backend gains an import, not an enrichment code path.

**Lead and Decision Maker**
- The Lead gains Decision Maker fields: name, role, email, whether the name is trusted, where the Decision Maker came from (import or manual), and when it was last updated. One Decision Maker per Lead; no separate contact entity.
- The Lead's existing email column remains the business's general address and is also filled by the import.
- The Lead gains a stored Google review count and the date it was captured, populated by the Lead Pipeline at discovery. Existing Leads are back-filled once from the review-count Gap Signal's description text.
- The Lead gains a last-verified timestamp.
- Outreach Address is derived, not stored: the Decision Maker's email if present, otherwise the business email. Its type (direct or generic inbox) is derived from the mailbox name against a fixed list of generic mailbox names.
- The cleaned company name and the greeting are derived at export time and never stored. They are frozen only inside a confirmed Campaign's member record.

**Enrichment import**
- A new import endpoint accepts the Enrichment results file. The file's columns are a contract with the local Enrichment tool; the Lead ID column is mandatory.
- The existing Lead CSV exports gain a Lead ID column so the round trip is possible.
- Matching is by Lead ID only. Rows with a missing or unknown ID are rejected and returned in the response; no fuzzy matching.
- Email cleaning on import: lower-case, URL-decode, validate format, discard placeholder domains and image-file false positives.
- A name is marked trusted when the Enrichment evidence flag is true and the name passes a junk filter; inferred-from-mailbox names are stored as untrusted or not at all. A manually entered Decision Maker is always trusted and is never overwritten by an import.

**Gap analyzer changes**
- `no_https` is redefined: it fires when a request to the site ends on an `http://` address after redirects, not when the stored URL merely begins with `http://`.
- A new hard signal distinguishes a certificate failure from an unreachable site. Both map to the Website Build Service. It needs entries in the service map and the internal sales copy, as the existing consistency assertions require.
- A response that refuses the check (403, 429, 5xx) yields a distinct "could not verify" outcome with no website signals, rather than `broken_website`.
- The analyzer gains a mode that skips PageSpeed. Re-verification uses it; discovery is unchanged.
- This overlaps with the open parked-domain work (issues #21–#23), which also makes the fetch helper return the final URL after redirects. Whichever lands second builds on the first; they must not both restructure the fetch helper independently.

**Re-verification**
- A new module owns Re-verification: given Leads, run the analyzer without PageSpeed, replace website-derived Gap Signals, carry forward PageSpeed-derived signals and the review-count signal unchanged, recompute Gap Score, and stamp last-verified.
- It runs concurrently across Leads with a bounded number of simultaneous requests, and synchronously within the request — the caller waits. No background job or job table.
- A Lead left with no hard Gap Signal is kept; its Lead Status is not changed.

**Findings**
- Findings are defined in code beside the signal definitions: for each signal type that has one, a sentence template and a rank. They are separate from the existing internal sales copy.
- Rank order: site unreachable, certificate failure, no HTTPS, no mobile viewport, missing title, missing description, review count, no schema markup. Sitemap, robots.txt and all PageSpeed-derived, analytics, Open Graph, H1 and alt-text signals have no Finding in this work.
- A review-count Finding is produced only when the stored count's captured date is within 90 days.
- Findings are computed from current Gap Signals on demand; they are not stored on the Lead.

**Campaigns**
- New entities: Campaign (name, notes, created date) and Campaign Member (Campaign, Lead, and a frozen snapshot of every exported CSV field for that Lead).
- The snapshot makes re-download byte-identical and answers "what did we say" even after the Lead's signals change.
- Preview is a read-only operation: given Lead IDs and optional per-Lead 90-day overrides, it triggers Re-verification for stale Leads, evaluates Campaign Eligibility, and returns included rows and skipped rows with one reason each. It writes nothing except the Re-verification results.
- Confirm is a single transaction: re-evaluate eligibility, create the Campaign and members, set Leads to `contacted`, write Outreach History. If eligibility changed since the preview, the changed Leads are reported and skipped rather than failing the whole confirm.
- Removing a member deletes the member row and the Outreach History rows that Campaign created for it, and sets the Lead to `reviewing`. There is no Campaign delete endpoint.
- Skip reasons are a fixed enumeration: status not eligible, no Outreach Address, no Findings, on Do-Not-Contact List, contacted within 90 days, duplicate of another selected Lead.

**Outreach History and Do-Not-Contact List (ADR 0015)**
- Both are stored keyed by normalised email address and by website domain, not by Lead. Outreach History rows reference the Campaign that created them.
- Eligibility looks up a Lead's Outreach Address and website domain in both. Lead Status alone is never used to decide whether a business was contacted.
- Domain normalisation: lower-case, strip `www.`. A fixed list of shared email providers is excluded from domain-level matching, for both structures.
- Do-Not-Contact entries carry a reason (opted out, bounced, manual) and a created date. Endpoints: list/search, add one, add many from pasted text, import a file, remove one.
- The outreach-tool import accepts a CSV and reads the email column; the exact column names are confirmed against a real export when one exists and are tolerant of header variations.

**Export CSV contract**
- Columns, in order: email, first_name, greeting, company, trade, city, state, website, domain, opening_line, followup_line, finding_1, finding_2, finding_codes, service_angle, review_count, phone, contact_type, gap_score, campaign, checked_on.
- Trade is derived from the Run's business type, falling back to keywords in the business name.
- Company cleaning: cut at separators that introduce a tagline, strip legal suffixes, and title-case names that are mostly capitals while preserving known acronyms.
- A working reference for these derivations exists as a script in the local sandbox; its behaviour, not its code, is the starting point.

**Frontend**
- Lead list: Outreach Address column with direct/generic indicator, a "has Outreach Address" filter, multi-select, and an "Export for outreach" action.
- Lead detail panel: Decision Maker view/edit, current Findings, last-verified date, Campaign membership, Do-Not-Contact indicator, and a "Re-verify" action.
- Export flow: progress during Re-verification, then the preview with included and skipped tabs, per-Lead 90-day override, Campaign name and notes, confirm, download.
- New pages: Campaign list, Campaign detail (members, re-download, remove member), Do-Not-Contact List (list, search, add, paste, import, remove), and an Enrichment import screen with the result summary.

## Testing Decisions

A good test here exercises behaviour a user could observe — the response of an endpoint or the contents of the CSV — and would still pass if the internals were rewritten. No test should assert on private helpers, table layouts or the order of internal calls.

**Seam 1 — the HTTP API with an isolated in-memory database.** This is the primary seam and carries almost all of the feature. Prior art: the existing export and lead API tests, which build a FastAPI test client over an in-memory SQLite database with the auth bypass fixture. Website checks are faked at one point only, the analyzer's entry function. Covered through this seam:
- Enrichment import: matching by ID, rejected rows, email cleaning, name trust, manual Decision Maker not overwritten.
- Re-verification: signals replaced, score recomputed, PageSpeed and review signals carried forward, last-verified stamped, a fully fixed Lead kept with status unchanged, "could not verify" yields no website Findings.
- Campaign Eligibility: one test per skip reason, the 90-day override, the Do-Not-Contact match that cannot be overridden, the same business as two Leads from two Runs, two selected Leads sharing a domain, the shared-provider exception.
- Preview writes no Campaign; confirm writes everything atomically and sets `contacted`.
- CSV contents: greeting with trusted, untrusted and missing names; company cleaning; opening and follow-up lines for each Finding and for a single-Finding Lead; Finding order; review-count expiry at 90 days; stable column order; identical re-download.
- Member removal restores `reviewing` and clears that Campaign's Outreach History so the Lead is eligible again.
- Do-Not-Contact: add, bulk paste, file import, domain-wide blocking, shared-provider exception, entries with no matching Lead, removal.

**Seam 2 — the gap analyzer in isolation with web requests faked.** Prior art: the existing gap analyzer tests. Used only for the detection changes: `no_https` based on where the request ends up, certificate failure versus unreachable, refused checks, and the skip-PageSpeed mode. Existing analyzer tests must keep passing, with the `no_https` cases updated to the new definition.

**Not a seam:** Findings, name trust, company cleaning and eligibility rules are deliberately not unit-tested as separate modules; they are verified through the CSV and preview responses at Seam 1.

**Frontend:** follow the existing page-level tests (testing-library with mocked API calls) for the export flow, the Decision Maker editor and the Do-Not-Contact page. No new frontend testing approach.

**Migrations:** the existing migration test must cover the new schema, including the review-count back-fill.

## Out of Scope

- Pushing Leads to an outreach tool through its API, pulling back replies, opens or bounces automatically, and creating Deals from replies.
- Storing or editing email copy in LeadPro.
- Running Enrichment inside the deployed backend, a hosted LLM, or any paid enrichment provider.
- Paid email verification (already scoped as Tier 2 in the lead verification notes).
- Phone or call-list campaigns for Leads with no Outreach Address.
- Refreshing Google review counts during Re-verification.
- Findings for PageSpeed-derived, analytics, Open Graph, H1 and alt-text signals.
- Automatically excluding non-contractors (suppliers, trade associations) at discovery; they are marked `pass` by hand.
- A de-duplicated Business entity spanning Runs.
- Background jobs for Re-verification.
- Multiple Decision Makers per Lead.
- User-editable Finding wording.
- The CRM Pipeline (Deals, Team Members, Packages), which is specified separately and not yet built.

## Further Notes

- Domain language is defined in `CONTEXT.md`: Decision Maker, Enrichment, Outreach Address, Re-verification, Finding, Campaign, Campaign Eligibility, Outreach History, Do-Not-Contact List.
- Decisions recorded as ADR 0015 (Outreach History and Do-Not-Contact keyed by email and domain) and ADR 0016 (Enrichment outside the app, by import).
- Evidence from the first manual campaign: 345 Leads enriched, 118 with a usable address, 93 exportable after live re-checking; 25 had fixed every stored problem since their Run; only 6 of the many stored "no HTTPS" signals were still true. This is why Re-verification is a precondition of export and not an optional extra.
- Email yield (about a quarter of enriched Leads) is the real ceiling on Campaign size. This work makes that visible through the import summary and the "no Outreach Address" skip count but does not try to raise it.
- Commercial email to US recipients must carry a postal address and honour opt-outs promptly. LeadPro's part in that is the Do-Not-Contact List; the footer lives in the outreach tool.
