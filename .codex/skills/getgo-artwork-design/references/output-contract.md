# Design package output contract

Use GetGo Tools' Design Projects directory and manifest model:

```text
<design-project>/
├── project.json
└── pages/
    └── <page-slug>/
        ├── design.json
        ├── generation-manifest.json
        ├── validation-report.json
        ├── alpha-report.json
        ├── portrait-light.png
        ├── portrait-light.html
        ├── portrait-dark.png
        ├── portrait-dark.html
        ├── landscape-light.png
        ├── landscape-light.html
        ├── landscape-dark.png
        ├── landscape-dark.html
        └── assets/<asset-id>.png
```

Extend the shared schema/version when the current model lacks a required field; do not create an incompatible sidecar project format.

## `project.json`

Keep project identity, description, shared instructions, screenshot references, pages, timestamps, and schema version. Page records point to the canonical specification, four artifacts, and asset inventory.

## `design.json`

The source of truth contains schema/page identity, route and source references; reusable colors, typography, spacing, radii, and shadows; asset roles, files, anchors, focal points, variants, and transparency; four artboards; ordered nodes with stable IDs; exact bounds and visual properties; exact text and semantic roles; responsive/crop intent; and accessibility/decorative flags.

Every reference must resolve. Each light/dark pair must use the same node IDs, DOM structure, bounds, spacing, shapes, artwork boxes, crop values, layer order, and content. Theme values are stored as light/dark token pairs rather than duplicated geometry. The only permitted asset substitution is `sun` ↔ `moon`, using the same box, anchor, focal point, and z-index. Accessibility requirements may change colors or contrast treatment but never layout geometry.

## Reference PNGs

Each PNG is an edge-to-edge comparison target for one variant, without device/browser frames. Never use it as the reconstruction's full-page background.

For each orientation, derive the dark PNG from the approved light composition. Visual-diff validation must mask theme-color changes and the shared celestial box, then require all remaining element geometry to match.

## Reconstructed HTML

Each file corresponds to one variant and reconstructs `design.json` using semantic HTML and CSS. Light/dark files for one orientation must render the same shared element tree and differ only by a theme selector/token values and the sun/moon source. It references local relative assets and contains no remote URLs, third-party dependencies, embedded base64, canvas, or rasterized UI. Preserve logical focus order, visible focus, contrast, and noninteractive `aria-hidden` decoration. Do not scale one fixed page wholesale as responsive layout.

## Reports

- `generation-manifest.json`: the closed source allowlist; exact input paths/IDs and roles; prompts; tool/mode; outputs; processing; and per-output provenance. It must distinguish style references from assets explicitly authorized for reuse.
- `alpha-report.json`: transparency measurements and visual edge status.
- `validation-report.json`: schema, files, references, variants, dimensions, HTML restrictions, provenance/allowlist enforcement, visual comparison, accessibility, and failures. It must include light/dark DOM parity, geometry parity, and celestial-box parity results for both orientations.

Never claim browser visual verification when the simulator/runtime was unavailable.
