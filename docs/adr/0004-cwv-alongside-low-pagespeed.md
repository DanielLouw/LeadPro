# 0004 — Core Web Vitals as independent soft signals alongside low_pagespeed

**Status:** Accepted

## Context

The gap analyzer has a hard signal `low_pagespeed` that fires when the Google PageSpeed Insights mobile score is below 50. The same API response contains Core Web Vitals data (LCP, CLS, INP). A site scoring ≥ 50 on PageSpeed can still have individual CWV metrics in Google's "Poor" range — slow LCP, unstable layout, or sluggish interaction — which represent genuine problems that a Website Modernisation engagement can fix.

## Decision

Add `slow_lcp`, `high_cls`, and `slow_inp` as soft gap signals that fire independently of `low_pagespeed`, using Google's published "Poor" thresholds: LCP > 4s, CLS > 0.25, INP > 500ms. These signals do not replace `low_pagespeed` and may fire alongside it.

## Alternatives considered

**Replace `low_pagespeed` with CWV signals.** Rejected because the composite PageSpeed score captures rendering, resource weight, and other factors that CWV alone does not. Both offer distinct signal value.

**Only fire CWV signals when `low_pagespeed` does not.** Rejected because a site can score above 50 overall while still having a critically slow LCP — suppressing the signal in that case would miss a real gap.

## Consequences

A lead with a borderline PageSpeed score may now accumulate multiple soft signals from CWV, raising their Gap Score. The sales copy for each CWV signal is metric-specific ("your largest image takes 6 seconds to appear") rather than the generic `low_pagespeed` copy, making the Website Modernisation pitch more concrete.
