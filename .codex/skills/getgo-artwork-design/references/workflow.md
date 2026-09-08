# Screenshot-to-artwork workflow

## 0. Create the source allowlist

Before inspecting candidate artwork, resolve the exact Screenshot Manager project, selected page/route, selected Design Project, and user-supplied references. Record each approved input and its role.

Do not browse neighboring design folders for inspiration or reusable files. Do not use legacy reconstructions, previous experiments, rejected drafts, or similarly named pages unless explicitly referenced by the selected project or user. If an outside artifact would help, request explicit inclusion before reading or using it.

## 1. Resolve the source page

- Locate the selected Screenshot Manager project and page/route.
- Load its available `portrait-light`, `portrait-dark`, `landscape-light`, and `landscape-dark` captures.
- Load matching DOM snapshots, page breakdowns, general rules, shared structure library, and page definition.
- Record missing source variants. Derive one only from established project rules and disclose that derivation.

## 2. Extract invariants and requested changes

Record content and controls that must remain, route and interaction hierarchy, shared shell and structures, visual tokens, variant transformations, and only the requested changes. Do not let artwork alter functional content, invent data, or remove a captured state.

## 3. Define one design system

Reuse only tokens and recurring characters/assets explicitly approved by the selected project's own records. Style references may guide visual properties but are not permission to copy their files. Add a token only when the page needs a missing semantic role. Keep one content model across all variants.

## 4. Create reference designs

Design two compositions: portrait and landscape. Produce the light reference for each composition first. Derive its dark reference without changing layout or scene geometry: apply dark theme colors and replace only the sun with the moon in the identical celestial box. Do not ask an image model to reinterpret the whole dark scene.

The four resulting reference files remain edge-to-edge flat pages without device or browser frames. Use real source content for evaluation while keeping functional text and controls separable from artwork. Overlay or diff each light/dark pair and reject it if any non-theme geometry or non-celestial element changes.

## 5. Build the asset inventory

Identify only artwork that should not be recreated with code-native UI. Give each asset a stable ID, role, anchor, intended variants, focal point, and provenance. Reuse an asset only when the source allowlist marks that exact file as `approved-reusable-asset`; otherwise generate a new asset from the approved references. Create explicit compact/wide or light/dark variants only when necessary.

## 6. Generate or extract assets

Follow `artwork.md`. Generate one isolated asset per image call. Inspect each output, make targeted iterations, save accepted files under `assets/`, and retain provenance. Final packages must not reference rejected drafts.

## 7. Write the canonical specification

Follow `output-contract.md`. Encode tokens, assets, variants, nodes, exact geometry, semantics, responsive intent, and crop behavior in `design.json`. Avoid independent layout truth in HTML or scripts.

## 8. Reconstruct HTML

Create one complete HTML document per variant with semantic headings, forms, labels, inputs, buttons, and links. Use CSS layout and local assets. Do not use canvas, screenshot backgrounds, embedded base64, remote dependencies, or rasterized UI.

## 9. Validate and compare

- Validate JSON, references, variant coverage, dimensions, and alpha.
- Open each reference and reconstruction side by side in Design Simulator.
- Pixel-align light/dark pairs and verify identical element bounds, masks, crop windows, and layer order. Only theme colors and the sun/moon pixels may differ.
- Check composition, theme parity, content, text overflow, focus, zoom, and safe areas.
- Fix the specification or shared reconstruction logic instead of stacking page-local patches.

## 10. Finish the package

Ensure all deliverables exist, every final file is referenced, provenance contains no non-allowlisted source, and reports pass. Report paths, final prompts, generation mode, derived assumptions, and any genuinely blocked visual verification.
