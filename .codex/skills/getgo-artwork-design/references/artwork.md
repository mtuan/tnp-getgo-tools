# Artwork generation contract

## Boundary

Use raster artwork for art-directed characters, scenery, textures, and complex illustrated objects. Prefer repository-native SVG/vector assets for simple shapes, functional icons, and established logos. Never rasterize controls, navigation, form fields, labels, errors, or ordinary text.

## Provenance and reuse

- Every source image must appear in the task's source allowlist before it is inspected or used.
- A `style-reference` controls style only. Never extract, crop, copy, or ship pixels from it.
- An `approved-reusable-asset` may be copied into the page package without regeneration. Nothing else may be reused as a production asset.
- An `edit-target` may be transformed only as requested, with invariants preserved.
- A `functional-reference` or `structural-reference` defines content and layout but is never an artwork asset source.
- Do not use repository search to find aesthetically similar assets. Search may resolve an explicitly identified input but cannot expand the allowlist.
- The generation manifest must prove provenance for every output. Missing, ambiguous, or out-of-scope provenance fails validation.

## Asset requirements

Every transparent production asset must:

- contain one reusable subject or one cohesive scenery layer;
- use real PNG alpha with fully transparent pixels;
- be complete and uncropped, with useful transparent padding;
- have clean edges without a matte, checkerboard, fringe, glow, or low-alpha halo;
- contain no text, watermark, logo, UI control, device frame, or unintended object;
- match established identity, proportions, medium, palette roles, line weight, and lighting;
- use a stable lowercase kebab-case filename;
- declare its anchor, focal point, and supported variants in `design.json`.

Do not combine unrelated assets into a sprite sheet. Do not overwrite an accepted asset unless replacement was requested; use a versioned sibling while iterating.

## Variant strategy

Generate the portrait and landscape compositions independently when their aspect ratios require recomposition. Within one orientation, use the exact same assets, boxes, anchors, crops, and stacking for light and dark.

- Prefer theme-neutral transparent characters and scenery that remain readable in both modes.
- Reuse the light-mode scenery in dark mode with deterministic theme background/surface values. Do not generate a second dark meadow, character, cloud set, or composition.
- Provide exactly one intentional celestial pair when needed: sun for light and moon for dark. They must have geometry-compatible transparent canvases and occupy the same box.
- Do not recolor detailed raster art with CSS filters. If shared artwork cannot remain legible on both backgrounds without filtering, correct its neutral contrast during asset generation.
- Do not stretch an asset to another aspect ratio. Crop through documented focal points and remove peripheral decoration before compressing content.

## Prompt contract

```text
Use case: stylized-concept | background-extraction | precise-object-edit
Asset type: <page and role>
Input images: <numbered roles, if any>
Primary request: <one asset>
Style/medium: <established project style>
Composition/framing: <complete silhouette, anchor, transparent padding>
Lighting/mood: <project-consistent values>
Color palette: <semantic palette role>
Constraints: transparent background; preserve listed invariants
Avoid: text, controls, logos, watermark, frames, extra objects, matte, checkerboard
```

For edits, state `change only X; keep Y unchanged` on every iteration. Use one generation call per distinct asset and make one targeted correction per iteration.

When creating a sun/moon pair, approve the sun composition first. Generate the moon as a precise replacement constrained to the same transparent canvas, silhouette bounds, visual weight, anchor, and padding. Do not include surrounding stars, clouds, or sky in either celestial asset.

## Manifest and validation

For each accepted asset record its ID/file, every allowlisted source and role, final prompt, generation tool/mode, dimensions, variants, post-processing, and status. The alpha report records dimensions, mode, alpha minimum/maximum, fully transparent pixel count, and pass/fail. Also inspect edges on white, black, light-theme, and dark-theme backgrounds. Fail validation if a file was copied or derived from a source not explicitly classified as `approved-reusable-asset` or `edit-target`.
