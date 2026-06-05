# 0005 — Config Builder UI

**Type:** AFK
**Blocked by:** #0001

## What to build

Build the Config Builder page in the React dashboard. The user selects business types from a curated categorised list, picks US cities via a state → city picker, optionally adds free-text business types, and generates a Search Config YAML. Previously saved YAML configs can be loaded back into the UI.

The curated business type list and the state/city data are stored as data files (not hardcoded) so they can be extended without a code change.

## Acceptance criteria

- [x] Config Builder page shows a curated business type list grouped by vertical (Home Services, Health & Wellness, Food & Hospitality, Professional Services, Auto — as defined in the PRD)
- [x] User can select multiple business types via checkboxes
- [x] A free-text field allows adding business types not in the curated list
- [x] State → city picker: user selects a US state, city list filters to major cities in that state
- [x] User can select multiple cities across multiple states
- [x] "Generate YAML" produces a valid Search Config YAML from current selections, displayed in a text area for copy/download
- [x] "Load Config" accepts a pasted or uploaded YAML and repopulates the form selections
- [x] Business type data and state/city data are loaded from external data files, not hardcoded in components
- [x] Generated YAML matches the Search Config shape defined in the PRD

## Blocked by

#0001 — Project Scaffold & DB Schema
