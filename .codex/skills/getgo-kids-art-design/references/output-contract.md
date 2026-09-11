# Page package contract

The page folder is `tnp-getgo-tools/design/kids-friendly/<page-name>/` and contains `assets/`, `index.html`, `index.css`, `index.js`, `design.json`, `generation-manifest.json`, and `validation-report.json`. A `demos/` directory is optional and exists only for preserved previews or runtime rendering explicitly requested by the administrator.

At workflow start, create the page folder, `assets/`, and a temporary semantic under-construction `index.html`, then register the exact slug and `<page-name>/index.html` path with bilingual titles in `design/kids-friendly/preview.js`. Replace the placeholder with the canonical responsive entrypoint before final validation. Gallery registration is part of the package contract even though `preview.js` lives at the design-project root.

When explicitly requested, `demos/` contains `portrait-light.png`, `portrait-dark.png`, `landscape-light.png`, and `landscape-dark.png` rendered from the matching HTML through the administrator-approved surface. Otherwise omit the directory or mark preserved previews stale; never probe for a renderer to create it.

`index.html` is the only page entrypoint. It is fluid across portrait and landscape and supports light and dark modes through CSS and shared theme behavior. `index.css` and `index.js` contain only code unique to that page.

Every page synchronously links `../shared/common.css` before `index.css`, then loads `../shared/common.js` before `index.js`. Its semantic `main.page` declares `kids-bounded-page` when `page.heightBehavior` is `vertical-scroll`, or `kids-fullscreen-page` when it is `fullscreen-fixed`. Do not add either class later with JavaScript.

Put reusable assets in `design/kids-friendly/shared/assets/` and reusable layout, theme, navigation, background, and decoration code in `shared/common.css` or `shared/common.js`. Do not copy shared code or assets into page folders. Add to a page's `assets/`, `index.css`, or `index.js` only when the resource is genuinely page-specific.

## `design.json`

Record schema version, page slug/name/route, sources, canonical viewport sizes (`390 × 844` CSS pixels for portrait and `1024 × 768` CSS pixels for landscape), art direction, tokens, the shared solid page-background color, overlay color/opacity, safe zones, shared semantic content, the captured layout-lock measurements for each orientation, artwork composition rules, page height behavior (`fullscreen-fixed` or `vertical-scroll`), and proof that dark mode shares assets and geometry.

For every asset record stable ID, relative file, role, dimensions, orientation support, anchor, focal point, crop behavior, maximum display box, z-index, layout participation (`none` for decoration), and `backgroundMode` (`transparent`, `removal-matte`, or `opaque-background`). Final header, footer, and cut assets must use `backgroundMode: "transparent"`; `removal-matte` is valid only for a recorded intermediate source. Fullscreen fixed pages identify their full-page background. Vertical-scroll pages identify separate `header` and `footer` edge assets, their full-width behavior, and `document-top` / `document-bottom` anchors. Section decorations identify the existing region they accent without changing its bounds. Record `removalMatte`, normally `#8B00FF`, and the conversion parameters when applicable.

Orientation-specific raster dimensions are mandatory, not suggested export targets:

- portrait fullscreen background: exactly `1170 × 2532px` (3× density for a `390 × 844` CSS-pixel viewport);
- landscape fullscreen background: exactly `2048 × 1536px` (2× density for a `1024 × 768` CSS-pixel viewport);
- portrait header or footer: exactly `1170px` intrinsic width, displayed at `390px` logical width, with an art-directed proportional height;
- landscape header or footer: exactly `2048px` intrinsic width, displayed at up to `1024px` logical width, with an art-directed proportional height.

The file's intrinsic PNG dimensions must equal the `dimensions` value in its asset record. CSS must scale the high-density artwork down proportionally; never scale it beyond its canonical logical display size, change its aspect ratio, or use `cover` to repair an incorrectly composed asset. Assets in a shared design-level folder follow the same contract.

For an isolated asset used in both orientations, `maximumDisplayBox` describes the largest CSS box across portrait and landscape and the shared PNG must provide at least 3× that width and height. Record `densityStrategy: "shared-3x-max-display"`. Do not create a second orientation file merely because landscape edge artwork uses 2× exports. If separate isolated variants are necessary because their pose, crop, composition, safe area, or logical display box changes, record `densityStrategy: "orientation-specific"` and `orientationVariantReason` on each asset.

Every related asset record also identifies the common style-lock ID or family ID used to keep palette, medium, lighting, outline treatment, subject identity, padding, and transparency processing consistent across the set.

## `generation-manifest.json`

Record every input with exact path or ID and role (`functional-reference`, `structural-reference`, `style-reference`, `instruction`, `edit-target`, or `approved-reusable-asset`). Record the shared style-lock block, canonical identity references, every prompt, output, revision decision, post-processing step, matte value, and acceptance/rejection status. A matte-removal step records `tool: "scripts/remove-solid-background.mjs"`, input/output paths, matte color, tolerance, softness, and edge threshold. Every generated raster output must record `generationTool: "built-in-image_gen"` and `credentialMode: "none"`. Never record or expose credential values. A style reference is evidence only, not permission to copy pixels.

## HTML invariants

- Content and controls remain semantic, selectable, and keyboard accessible.
- UI regions, bounds, ordering, alignment, spacing, typography hierarchy, component shapes, presentation, and responsive behavior match the corresponding captured source unless an administrator-requested exception is recorded.
- Fixed light/dark files for one orientation use the same element tree, bounds, crop, assets, and stacking. Theme changes use tokens and a dark overlay only.
- All packages use the shared dark artwork mask `rgba(0, 32, 27, .72)`, applied once by the shared shell above decorative artwork and below semantic content. Page CSS cannot redefine its opacity or stacking.
- Semantic content always stacks above the mask. Every visible text role, link, icon, badge, panel, and button variant/state records or implements explicit dark-theme foreground, background, border, hover, focus, active, and disabled treatment where applicable; inheriting light-only styling does not satisfy theme support.
- The shared shell owns the 1024px scrolling-page boundary, edge-art width containment, theme canvas, and fixed application-bar alignment. Capped pages retain the original canvas color outside the boundary; fullscreen-background pages fill the viewport and show no side marker.
- Fixed top and bottom application surfaces terminate exactly at `top: 0` and `bottom: 0`. The gallery preview clips any device-frame overscan outside the canonical visible viewport instead of adding gaps inside the page.
- Responsive HTML has an obvious theme toggle, honors initial `prefers-color-scheme`, and recomposes automatically by viewport aspect/width.
- On scrolling pages, one solid code-native page background covers the entire document behind both edge assets and the expandable middle. Transparent header artwork is anchored to the document top and transitions to alpha at its bottom edge; transparent footer artwork follows the content bottom and transitions from alpha at its top edge. Neither is viewport-fixed or sticky unless the recorded shell contract reserves its space. Do not conceal opaque image bounds with separately matched colors.
- Dependencies and artwork are local. No remote URLs, base64 images, canvas reconstruction, full-page screenshot backgrounds, or generated text embedded in artwork.
- Decorative layers cannot intercept pointer input.
- Decorations do not participate in document flow or flex/grid sizing and cannot change text wrapping, section/card dimensions, or hit areas.

## `validation-report.json`

Record pass/fail and evidence for required source/package checks: files, declared dimensions, source-content and semantic-control parity, region geometry rules, spacing/alignment rules, typography and component-presentation parity, local-only HTML, artwork-only orientation recomposition, light/dark asset and geometry parity, overlay behavior, theme-neutral backgrounds, decoration non-interference, natural object placement, cross-asset style/identity consistency, built-in-only generation provenance, and matte/alpha inspection. Record keyboard/focus, resize, short viewport, tall scrolling content, 200% zoom, source-layout pixel overlay, and rendered comparisons as `not-requested` unless the administrator explicitly requested and authorized runtime rendering in the current request.
