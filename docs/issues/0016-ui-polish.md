# 0016 — UI Polish

**Type:** AFK — use the `ckm:ui-styling` skill
**Blocked by:** None (best run last to avoid conflicts with other in-flight changes)

## Parent

https://github.com/DanielLouw/LeadPro/issues/1

## What to build

Apply a visual polish pass across the whole app using the `ckm:ui-styling` skill. The goal is a clean, consistent, professional feel — not a redesign. Structure stays the same; spacing, typography, and component styles are fixed.

Known pain points to address:
- Business type checkboxes are cramped and hard to scan — needs proper spacing and alignment
- Form controls (selects, inputs, textareas) are inconsistent in sizing across pages
- Button styles are not differentiated — primary, secondary, and destructive actions look the same
- General spacing and typography feel uneven across Config Builder and Lead Results

**Use the `ckm:ui-styling` skill** to drive all styling decisions in this issue.

## Acceptance criteria

- [ ] Business type checkboxes have consistent spacing and are easy to scan and select
- [ ] Form controls (selects, inputs, textareas) have consistent sizing and spacing throughout the app
- [ ] Buttons are visually differentiated: primary actions (e.g. confirm, run) are distinct from secondary (e.g. cancel) and destructive actions
- [ ] Spacing and typography are consistent across Config Builder and Lead Results pages
- [ ] No existing behaviour or test assertions are broken by style changes
- [ ] All existing frontend tests continue to pass after the styling pass

## Blocked by

None — can start immediately, but recommended to run after #0011–#0015 are merged to avoid conflicts on shared components.
