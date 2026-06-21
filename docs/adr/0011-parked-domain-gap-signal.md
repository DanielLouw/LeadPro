# `parked_domain` as a distinct hard gap signal

When a business has a domain that redirects to a domain registrar or parking service (GoDaddy, Sedo, ParkingCrew, etc.), the gap analyzer previously missed it entirely. Parked domains return HTTP 200 after the redirect, so neither `broken_website` nor `no_website` fired — the business appeared to have a live site.

We added `parked_domain` as a distinct hard gap signal rather than folding it into `broken_website` because the sales context is meaningfully different: the business already owns a domain and has previously invested in a web presence, which is a different and more specific conversation hook ("you own this domain — let's put a real site on it") than a business whose current site has simply broken. `broken_website` implies an active site that has suffered a technical failure; `parked_domain` implies a lapsed or abandoned web presence with an owned asset that can be immediately reactivated.

Detection is via redirect-URL matching only: the analyzer follows redirects (`httpx` with `follow_redirects=True`) and checks `response.url` against a known set of parking domains after the HTTP fetch. Content-based detection (scanning page HTML for "this domain is for sale" phrases) was considered and rejected — it adds parsing complexity and false-positive risk for marginal coverage gain over the redirect check. The parking domain list is the primary maintenance surface; it is updated when new parking services are encountered in production.

The same post-fetch redirect check also covers the case where a business's listed URL redirects to a social profile (e.g. `mybusiness.com` → `facebook.com/mybusiness`). This emits `social_as_website` rather than a new signal — the sales situation is identical to a directly-listed social URL, and a separate signal type would add noise without adding information.

Signal descriptions are dynamic: the detected registrar name is included in the stored description (e.g. "Domain is parked with GoDaddy — the business owns this domain but has no active website.") because the registrar name is already known at detection time and makes the signal more credible as a sales conversation starter.

## Considered options

**Fold into `broken_website`:** Simpler — one signal covers "no usable website" in all technical forms. Rejected because `broken_website` implies a technical failure the business may not be aware of; a parked domain is a deliberate (or lapsed) state that calls for a different pitch. The sales copy for `broken_website` ("your website is throwing errors") is inaccurate and potentially confusing for a business whose domain is intentionally parked.

**Fold into `no_website`:** Also considered — a parked domain is functionally equivalent to having no website. Rejected because the business does own a domain, which is a material fact worth surfacing. Collapsing it into `no_website` discards that information before it reaches the UI.

**Content-based detection (page HTML scanning):** Would catch parking pages that don't redirect (inline parking pages served on the original domain). Rejected for this implementation — adds parsing complexity and false-positive risk for marginal extra coverage. Redirect-URL matching catches the dominant pattern used by all major parking providers.
