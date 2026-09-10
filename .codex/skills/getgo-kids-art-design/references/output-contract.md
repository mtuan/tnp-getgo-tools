# Page package contract

The page folder is `tnp-getgo-tools/design/kids-friendly/<page-name>/` and contains `assets/`, `htmls/`, `design.json`, `generation-manifest.json`, and `validation-report.json`. A `demos/` directory is optional and exists only for preserved previews or runtime rendering explicitly requested by the administrator.

When explicitly requested, `demos/` contains `portrait-light.png`, `portrait-dark.png`, `landscape-light.png`, and `landscape-dark.png` rendered from the matching HTML through the administrator-approved surface. Otherwise omit the directory or mark preserved previews stale; never probe for a renderer to create it.

`htmls/` contains `portrait-light.html`, `portrait-dark.html`, `landscape-light.html`, `landscape-dark.html`, and `responsive.html`. Supporting local `.css` or `.js` files may exist to prevent drift.

## `design.json`

Record schema version, page slug/name/route, sources, canonical viewport sizes (`390 × 844` CSS pixels for portrait and `1024 × 768` CSS pixels for landscape), art direction, tokens, the shared solid page-background color, overlay color/opacity, safe zones, shared semantic content, the captured layout-lock measurements for each orientation, artwork composition rules, page height behavior (`fullscreen-fixed` or `vertical-scroll`), and proof that dark mode shares assets and geometry.

For every asset record stable ID, relative file, role, dimensions, orientation support, anchor, focal point, crop behavior, maximum display box, z-index, layout participation (`none` for decoration), and `backgroundMode` (`transparent`, `removal-matte`, or `opaque-background`). Final header, footer, and cut assets must use `backgroundMode: "transparent"`; `removal-matte` is valid only for a recorded intermediate source. Fullscreen fixed pages identify their full-page background. Vertical-scroll pages identify separate `header` and `footer` edge assets, their full-width behavior, and `document-top` / `document-bottom` anchors. Section decorations identify the existing region they accent without changing its bounds. Record `removalMatte`, normally `#8B00FF`, and the conversion parameters when applicable.

Orientation-specific raster dimensions are mandatory, not suggested export targets:

- portrait fullscreen background: exactly `390 × 844px`;
- landscape fullscreen background: exactly `1024 × 768px`;
- portrait header or footer: exactly `390px` wide, with an art-directed height;
- landscape header or footer: exactly `1024px` wide, with an art-directed height.

The file's intrinsic PNG dimensions must equal the `dimensions` value in its asset record. Do not satisfy these rules through CSS scaling, `cover`, runtime cropping, or a larger source file. Assets in a shared design-level folder follow the same contract.

## `generation-manifest.json`

Record every input with exact path or ID and role (`functional-reference`, `structural-reference`, `style-reference`, `instruction`, `edit-target`, or `approved-reusable-asset`). Record the shared style-lock block, canonical identity references, every prompt, output, revision decision, post-processing step, matte value, and acceptance/rejection status. A matte-removal step records `tool: "scripts/remove-solid-background.mjs"`, input/output paths, matte color, tolerance, softness, and edge threshold. Every generated raster output must record `generationTool: "built-in-image_gen"` and `credentialMode: "none"`. Never record or expose credential values. A style reference is evidence only, not permission to copy pixels.

## HTML invariants

- Content and controls remain semantic, selectable, and keyboard accessible.
- UI regions, bounds, ordering, alignment, spacing, typography hierarchy, component shapes, presentation, and responsive behavior match the corresponding captured source unless an administrator-requested exception is recorded.
- Fixed light/dark files for one orientation use the same element tree, bounds, crop, assets, and stacking. Theme changes use tokens and a dark overlay only.
- Responsive HTML has an obvious theme toggle, honors initial `prefers-color-scheme`, and recomposes automatically by viewport aspect/width.
- On scrolling pages, one solid code-native page background covers the entire document behind both edge assets and the expandable middle. Transparent header artwork is anchored to the document top and transitions to alpha at its bottom edge; transparent footer artwork follows the content bottom and transitions from alpha at its top edge. Neither is viewport-fixed or sticky unless the recorded shell contract reserves its space. Do not conceal opaque image bounds with separately matched colors.
- Dependencies and artwork are local. No remote URLs, base64 images, canvas reconstruction, full-page screenshot backgrounds, or generated text embedded in artwork.
- Decorative layers cannot intercept pointer input.
- Decorations do not participate in document flow or flex/grid sizing and cannot change text wrapping, section/card dimensions, or hit areas.

## `validation-report.json`

Record pass/fail and evidence for required source/package checks: files, declared dimensions, source-content and semantic-control parity, region geometry rules, spacing/alignment rules, typography and component-presentation parity, local-only HTML, artwork-only orientation recomposition, light/dark asset and geometry parity, overlay behavior, theme-neutral backgrounds, decoration non-interference, natural object placement, cross-asset style/identity consistency, built-in-only generation provenance, and matte/alpha inspection. Record keyboard/focus, resize, short viewport, tall scrolling content, 200% zoom, source-layout pixel overlay, and rendered comparisons as `not-requested` unless the administrator explicitly requested and authorized runtime rendering in the current request.
