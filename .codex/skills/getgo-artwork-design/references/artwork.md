# Artwork generation contract

## Boundary

Use raster artwork for art-directed characters, scenery, textures, and complex illustrated objects. Prefer repository-native SVG/vector assets for simple shapes, functional icons, and established logos. Never rasterize controls, navigation, form fields, labels, errors, or ordinary text.

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

Choose the smallest adequate strategy: one contrast-safe full-color asset; a tintable code-native/SVG motif; geometry-identical light/dark pairs; or explicit portrait/landscape scene variants sharing subject design and focal content. Do not recolor detailed raster art with CSS filters or stretch it to another aspect ratio. Crop through documented focal points and remove peripheral decoration before compressing content.

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

## Manifest and validation

For each accepted asset record its ID/file, source roles, final prompt, generation tool/mode, dimensions, variants, post-processing, and status. The alpha report records dimensions, mode, alpha minimum/maximum, fully transparent pixel count, and pass/fail. Also inspect edges on white, black, light-theme, and dark-theme backgrounds.
