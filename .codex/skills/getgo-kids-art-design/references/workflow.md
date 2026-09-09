# Production workflow

## 1. Establish evidence and page invariants

Resolve the Screenshot Manager record for the page name or URL. Load its captures and managed analysis/content, plus administrator Markdown instructions. Create a layout-lock inventory for every source orientation: region bounds, content width, ordering, alignment, gaps, section and row heights, typography hierarchy, control and card presentation, navigation placement, responsive transformations, states, and safe decoration regions. Create an explicit input allowlist in `generation-manifest.json`.

Unless the administrator explicitly names a UI change, mark every inventoried layout and presentation property immutable. The purpose of this workflow is to add artwork, not propose a new page design.

## 2. Write one scene brief and two composition plans

Define page purpose, focal character or motif, shared palette and medium, content-safe zones, background/middle/foreground layers, and asset inventory without changing the layout-lock inventory. Classify the page:

- `fullscreen-fixed`: use an orientation-specific full-page background behind the unchanged layout, for pages such as login and registration.
- `vertical-scroll`: use a full-width top edge asset and full-width bottom edge asset for each orientation, plus only necessary isolated accents, for pages such as profile and explore. Do not plan a viewport-height poster background.

Specify distinct portrait and landscape artwork framing around the source layouts. They must feel like two camera framings of the same illustrated world, while all UI geometry continues to match its corresponding capture.

Inventory optional decoration anchors already available in the layout, such as whitespace beside a category heading or an unused card corner. Each decoration must have a maximum box, absolute anchor, z-index, and no-layout-impact rule. If no safe space exists, omit the decoration rather than moving content.

Write a short scene-logic inventory before prompting: for every non-natural prop, name its support or holder and reject any composition that violates it. Example: `book — held by character or resting on desk; pencil — in hand, cup, bag, or on desk; never attached to foliage`. Do not invent fantasy physics unless the administrator requested it.

Plan only light artwork. Define dark behavior as an overlay and token transform before generation.

Create a reusable style-lock block containing the approved reference roles, medium, texture, semantic palette, line weight, light direction, character proportions, face/eye construction, and recurring foliage/flower language. If a recurring character exists, select or generate one canonical master image first. Every later built-in `image_gen` prompt must include the same style-lock block and use that master as a reference when identity must match.

## 3. Generate and evaluate light demos

Use `$imagegen` in default built-in mode. Generate artwork concepts against the captured page as an immutable layout reference. State explicitly in every concept prompt: `Do not redesign, move, resize, regroup, or restyle any UI; add artwork only in the named background and decoration regions.` On scrolling pages, the concept must demonstrate that top and bottom edge art remain coherent when the middle content region grows; the bottom scenery belongs at the document end, not the initial viewport edge. Generate the second orientation with the approved first artwork and canonical character asset as style/identity references, while requesting a new aspect-ratio artwork composition around the unchanged orientation layout. Reject any concept with altered UI geometry or presentation, malformed copy, fake controls, incoherent anatomy, implausibly supported or fused objects, identity or palette drift, cluttered content zones, aspect-ratio stretching, and baked time-of-day cues.

## 4. Produce reusable artwork

For scrolling pages, create orientation-specific full-width header and footer scenery as separate assets. Size and crop each for its edge role; keep the inward-facing edge visually soft so it blends into the code-native page background. Use an orientation-specific full background only when the page is demonstrably fixed-height and cannot scroll. Create each foreground character/object as its own cut asset. Prefer real alpha; otherwise use the solid removal-matte contract in `SKILL.md`. Never ship a generated checkerboard as transparency.

Use one built-in `image_gen` call for each distinct asset. For related assets, include the approved canonical image as a reference and repeat invariants verbatim. Never invoke an SDK, CLI, repository AI generator, or API-key workflow. Copy accepted built-in outputs into the page package; do not leave referenced files only in Codex's generated-images directory.

Use this prompt shape for each asset:

```text
Role: <fullscreen background | character | edge scenery | header | footer | section decoration>
Page purpose: <purpose>
Style: <project art direction and shared identity>
Style lock: <exact shared medium, texture, palette, line, lighting, anatomy, eyes, foliage>
Reference inputs: <canonical character/scene and role, when continuity is required>
Composition: <orientation, anchor, content-safe zone, complete silhouette>
Layout lock: preserve all captured UI bounds, spacing, alignment, typography, component presentation, and responsive behavior; this asset must not require a layout change
Scene logic: <each prop and its believable support/holder; no unintended floating or attachment>
Scroll behavior: <document-top header | document-bottom footer | isolated asset; never viewport-fixed unless reserved>
Palette/lighting: <theme-neutral canonical light artwork>
Background: <transparent PNG preferred | uniform #8B00FF removal matte>
Preserve: <approved identity and geometry>
Edit invariant: change only <target>; keep <identity, proportions, palette, medium> unchanged
Avoid: text, UI controls, logo, watermark, device frame, checkerboard,
       gradients/textures in removal matte, sun, moon, stars, night cues,
       extra objects, cropped silhouette, floating props, implausible attachments,
       objects hanging from or fused with foliage
```

## 5. Reconstruct with semantic HTML

Use local relative assets and ordinary HTML/CSS. Build content with headings, forms, labels, inputs, buttons, lists, and links. Decorative images have empty alt text or `aria-hidden="true"` and cannot receive pointer events.

Create one shared component/layout model. Four fixed files lock viewport and theme for comparison. `responsive.html` uses CSS media/container queries to recompose between portrait and landscape and includes a visible, keyboard-operable light/dark toggle. Dark state applies the overlay and tokens without changing artwork files or element geometry within an orientation.

Reconstruct the captured UI first and compare its geometry before adding any artwork. Add backgrounds and decorations as non-participating layers (`position: absolute` or equivalent) so they cannot affect intrinsic size, flex/grid allocation, wrapping, or document flow. Preserve existing UI surfaces and tokens unless a minimal contrast adjustment is required for readability over the new artwork; such an adjustment must not change geometry or component presentation.

Do not use canvas, remote fonts/libraries, embedded base64, or a full-page demo PNG as reconstruction content.

## 6. Render demos from HTML

Render fixed HTML at 393×852 for portrait and 1440×900 for landscape unless the selected project defines different canonical viewports. Save screenshots in `demos/`. Dark demos must render from the same orientation DOM and assets with dark overlay active—not edited or independently generated artwork.

Exercise `responsive.html` by resizing across portrait and landscape, toggling themes without reload, testing a short viewport, keyboard traversal, and 200% zoom.

For scrolling pages, also test at least one content height taller than the viewport. Confirm the header remains at the document top, the footer follows the true content end, the middle background extends cleanly, and neither edge asset overlaps sticky/fixed application chrome.

## 7. Validate and iterate

Run `node scripts/validate-package.mjs <page-folder>`. Overlay each reconstructed variant with its corresponding source capture before evaluating the artwork. Check region bounds, widths, heights, spacing, alignment, typography hierarchy, component presentation, control order, and responsive behavior. Then check safe areas, artwork crop/anchor intent, contrast, decoration restraint, asset edges/mattes, overflow, and interaction blocking.

Fix shared layout or source artwork when evidence shows a systemic problem. Do not accumulate page-local offsets to conceal a wrong composition. Reject any asset with impossible object placement or accidental fusion. Finish only after every artifact exists and `validation-report.json` truthfully records passed checks and unavailable runtime checks.
