# Page package contract

The page folder is `tnp-getgo-tools/design/kids-friendly/<page-name>/` and contains `assets/`, `demos/`, `htmls/`, `design.json`, `generation-manifest.json`, and `validation-report.json`.

`demos/` contains `portrait-light.png`, `portrait-dark.png`, `landscape-light.png`, and `landscape-dark.png` rendered from the matching HTML.

`htmls/` contains `portrait-light.html`, `portrait-dark.html`, `landscape-light.html`, `landscape-dark.html`, and `responsive.html`. Supporting local `.css` or `.js` files may exist to prevent drift.

## `design.json`

Record schema version, page slug/name/route, sources, canonical viewport sizes, art direction, tokens, overlay color/opacity, safe zones, shared semantic content, the captured layout-lock measurements for each orientation, artwork composition rules, page height behavior (`fullscreen-fixed` or `vertical-scroll`), and proof that dark mode shares assets and geometry.

For every asset record stable ID, relative file, role, dimensions, orientation support, anchor, focal point, crop behavior, maximum display box, z-index, layout participation (`none` for decoration), and `backgroundMode` (`transparent`, `removal-matte`, or `opaque-background`). Fullscreen fixed pages identify their full-page background. Vertical-scroll pages identify separate `header` and `footer` edge assets, their full-width behavior, and `document-top` / `document-bottom` anchors. Section decorations identify the existing region they accent without changing its bounds. Record `removalMatte`, normally `#8B00FF`, when applicable.

## `generation-manifest.json`

Record every input with exact path or ID and role (`functional-reference`, `structural-reference`, `style-reference`, `instruction`, `edit-target`, or `approved-reusable-asset`). Record the shared style-lock block, canonical identity references, every prompt, output, revision decision, post-processing step, matte value, and acceptance/rejection status. Every generated raster output must record `generationTool: "built-in-image_gen"` and `credentialMode: "none"`. Never record or expose credential values. A style reference is evidence only, not permission to copy pixels.

## HTML invariants

- Content and controls remain semantic, selectable, and keyboard accessible.
- UI regions, bounds, ordering, alignment, spacing, typography hierarchy, component shapes, presentation, and responsive behavior match the corresponding captured source unless an administrator-requested exception is recorded.
- Fixed light/dark files for one orientation use the same element tree, bounds, crop, assets, and stacking. Theme changes use tokens and a dark overlay only.
- Responsive HTML has an obvious theme toggle, honors initial `prefers-color-scheme`, and recomposes automatically by viewport aspect/width.
- On scrolling pages, header artwork is anchored to the document top and footer artwork follows the content bottom. Neither is viewport-fixed or sticky unless the recorded shell contract reserves its space. The center page background expands without stretching either asset.
- Dependencies and artwork are local. No remote URLs, base64 images, canvas reconstruction, full-page screenshot backgrounds, or generated text embedded in artwork.
- Decorative layers cannot intercept pointer input.
- Decorations do not participate in document flow or flex/grid sizing and cannot change text wrapping, section/card dimensions, or hit areas.

## `validation-report.json`

Record pass/fail and evidence for required files, dimensions, source-content and semantic-control parity, source-layout overlay comparison, region geometry parity, spacing/alignment parity, typography and component-presentation parity, local-only HTML, artwork-only orientation recomposition, light/dark asset and geometry parity, overlay behavior, theme-neutral backgrounds, decoration non-interference, natural object placement, cross-asset style/identity consistency, built-in-only generation provenance, matte/alpha inspection, keyboard/focus, resize, short viewport, tall scrolling content, 200% zoom, and four rendered comparisons. Mark unavailable checks as unavailable, never passed.
