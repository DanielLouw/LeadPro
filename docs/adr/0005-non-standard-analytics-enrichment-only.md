# 0005 — non_standard_analytics is enrichment-only and does not qualify leads

**Status:** Accepted

## Context

The gap analyzer detects whether a business has analytics instrumentation on their homepage. Two scenarios exist: no analytics at all (`no_analytics`) and a non-GA4/GTM tool present — e.g. Plausible, Hotjar, Segment (`non_standard_analytics`). The `non_standard_analytics` signal supports an "improve your analytics" pitch to businesses that already have some tracking in place.

A business with only `non_standard_analytics` and no hard gap signal would not qualify as a Lead under the current model (hard signal required). Treating it as a hard signal would misrepresent a deliberate tool choice as a technical deficiency.

## Decision

`non_standard_analytics` is a soft signal. It adds to the Gap Score on leads that already qualified via a hard signal, giving salespeople an additional angle. It does not surface new leads on its own.

## Alternatives considered

**Make `non_standard_analytics` a hard signal.** Rejected — a business running Plausible has not made a mistake. Flagging it as a critical gap would damage the salesperson's credibility if the prospect pushes back.

**Relax lead qualification to score-threshold-based.** Rejected as a larger model change with broader consequences for the pipeline filter. Deferred as a future enhancement if the use case becomes important enough.

## Consequences

Businesses that are technically well-built but running non-GA4 analytics will not appear in the Lead pipeline. The `non_standard_analytics` signal's value is entirely as additive sales context on already-qualified leads, where the pitch is "extend your analytics" rather than "you have nothing."
