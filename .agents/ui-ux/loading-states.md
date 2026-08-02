# Loading and Content-State Guidelines

- Load all required data for a coherent page or active view before rendering it as complete.
- Do not reveal raw IDs or partially resolved metadata that later shifts.
- Use geometry-matching skeletons for structured initial loads, not generic centered spinners.
- Keep skeleton geometry consistent with the final labels, controls, tables, gaps, and responsive arrangement.
- Animate each top-level loading, loaded, empty, or error state once using shared animation utilities.
- Do not stack equivalent animations on parent and child containers.
- Preserve layout, scroll position, fixed controls, focus, and interaction during transitions.
- Provide localized actionable error states and localized empty states with a relevant next action.
- Verify loading, loaded, empty, and error states independently in both themes.
