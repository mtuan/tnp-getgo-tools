# Production workflow

## 1. Establish evidence and page invariants

Resolve the Screenshot Manager record for the page name or URL. Load its captures and managed analysis/content, plus administrator Markdown instructions. Inventory exact content, controls, actions, ordering, responsive behavior, states, and safe interaction regions. Create an explicit input allowlist in `generation-manifest.json`.

## 2. Write one scene brief and two composition plans

Define page purpose, focal character or motif, shared palette and medium, content-safe zones, background/middle/foreground layers, and asset inventory. Then specify distinct portrait and landscape framing. They must feel like two camera framings of the same illustrated world, not unrelated themes and not one stretched image.

Plan only light artwork. Define dark behavior as an overlay and token transform before generation.

Create a reusable style-lock block containing the approved reference roles, medium, texture, semantic palette, line weight, light direction, character proportions, face/eye construction, and recurring foliage/flower language. If a recurring character exists, select or generate one canonical master image first. Every later built-in `image_gen` prompt must include the same style-lock block and use that master as a reference when identity must match.

## 3. Generate and evaluate light demos

Use `$imagegen` in default built-in mode. Generate portrait-light and landscape-light concepts using exact page content for spatial evaluation while keeping functional UI separable. Generate the second orientation with the approved first composition and canonical character asset as style/identity references, while explicitly requesting a new aspect-ratio composition rather than a crop. Reject malformed copy, fake controls, incoherent anatomy, identity or palette drift, cluttered content zones, aspect-ratio stretching, and baked time-of-day cues. Iterate the weaker composition with one targeted edit rather than accepting a merely attractive image.

## 4. Produce reusable artwork

Create orientation-specific full backgrounds when composition requires them. Create each foreground character/object as its own cut asset. Prefer real alpha; otherwise use the solid removal-matte contract in `SKILL.md`. Never ship a generated checkerboard as transparency.

Use one built-in `image_gen` call for each distinct asset. For related assets, include the approved canonical image as a reference and repeat invariants verbatim. Never invoke an SDK, CLI, repository AI generator, or API-key workflow. Copy accepted built-in outputs into the page package; do not leave referenced files only in Codex's generated-images directory.

Use this prompt shape for each asset:

```text
Role: <background | character | edge scenery | header | footer>
Page purpose: <purpose>
Style: <project art direction and shared identity>
Style lock: <exact shared medium, texture, palette, line, lighting, anatomy, eyes, foliage>
Reference inputs: <canonical character/scene and role, when continuity is required>
Composition: <orientation, anchor, content-safe zone, complete silhouette>
Palette/lighting: <theme-neutral canonical light artwork>
Background: <transparent PNG preferred | uniform #8B00FF removal matte>
Preserve: <approved identity and geometry>
Edit invariant: change only <target>; keep <identity, proportions, palette, medium> unchanged
Avoid: text, UI controls, logo, watermark, device frame, checkerboard,
       gradients/textures in removal matte, sun, moon, stars, night cues,
       extra objects, cropped silhouette
```

## 5. Reconstruct with semantic HTML

Use local relative assets and ordinary HTML/CSS. Build content with headings, forms, labels, inputs, buttons, lists, and links. Decorative images have empty alt text or `aria-hidden="true"` and cannot receive pointer events.

Create one shared component/layout model. Four fixed files lock viewport and theme for comparison. `responsive.html` uses CSS media/container queries to recompose between portrait and landscape and includes a visible, keyboard-operable light/dark toggle. Dark state applies the overlay and tokens without changing artwork files or element geometry within an orientation.

Do not use canvas, remote fonts/libraries, embedded base64, or a full-page demo PNG as reconstruction content.

## 6. Render demos from HTML

Render fixed HTML at 393×852 for portrait and 1440×900 for landscape unless the selected project defines different canonical viewports. Save screenshots in `demos/`. Dark demos must render from the same orientation DOM and assets with dark overlay active—not edited or independently generated artwork.

Exercise `responsive.html` by resizing across portrait and landscape, toggling themes without reload, testing a short viewport, keyboard traversal, and 200% zoom.

## 7. Validate and iterate

Run `node scripts/validate-package.mjs <page-folder>`. Visually compare all four HTML variants with demos and source page content. Check safe areas, crop/anchor intent, contrast, control order, asset edges/mattes, overflow, and interaction blocking.

Fix shared layout or source artwork when evidence shows a systemic problem. Do not accumulate page-local offsets to conceal a wrong composition. Finish only after every artifact exists and `validation-report.json` truthfully records passed checks and unavailable runtime checks.
