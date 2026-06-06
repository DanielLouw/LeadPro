# 0012 — Gap Signal Detail Panel: service label and sales copy

**Type:** AFK
**Blocked by:** #0011

## Parent

https://github.com/DanielLouw/LeadPro/issues/1

## What to build

Update the Lead Detail Panel to display the enriched gap signal fields added in #0011. For each gap signal, show the service name and the full sales-ready pitch copy alongside the existing plain-English description.

The panel should make it immediately clear what you would be selling and how to frame the call — no translation required from the user.

Use the `tdd` skill to drive implementation.

## Acceptance criteria

- [ ] Each gap signal in the detail panel shows its `service` label (Website Build, Website Modernisation, or SEO Package)
- [ ] Each gap signal shows its full `sales_copy` text
- [ ] Hard signals remain visually distinct (e.g. bold) from soft signals
- [ ] Service label is visually associated with its signal
- [ ] Frontend tests cover: service label renders per signal, sales_copy text renders per signal

## Blocked by

#0011 — Gap Signal API Enrichment (service and sales_copy must be in the API response first)
