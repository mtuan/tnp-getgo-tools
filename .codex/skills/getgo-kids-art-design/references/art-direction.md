# Kids-friendly art direction

Aim for a polished children's storybook world, not generic nursery clip art. Use cheerful watercolor/gouache-like texture, rounded friendly silhouettes, expressive but not uncanny animals, rich botanical layers, and clean shapes that remain legible behind real UI.

Preferred motifs include meadows, flowers, leafy trees, shrubs, winding paths, soft clouds, mushrooms, butterflies, and friendly woodland or classroom animals. Choose only motifs that support the page purpose. Keep the central content zone calm and lower contrast; concentrate detail near edges, corners, headers, footers, or dedicated illustration regions.

Use lively natural greens, sky blues, flower accents, warm cream surfaces, and restrained GetGo purple/blue accents. Maintain consistent line weight, material, light direction, character proportions, eye treatment, and finish across every asset in one page.

## Composition

- Preserve the captured UI composition exactly. Artwork decorates the page; it does not redesign the layout, presentation, or component system. Keep region positions and sizes, content widths, gaps, alignment, hierarchy, control shapes, typography scale, and responsive transformations intact.
- Design portrait and landscape artwork independently from one scene brief around the corresponding existing layouts. Recompose only scenery and decorative framing; never use artwork as a reason to move or restyle UI.
- For fixed-height fullscreen pages such as login and registration, use an orientation-specific full-page background behind the unchanged UI.
- Most application pages scroll vertically. Default to two orientation-specific transparent edge assets rather than one full-page illustration: a full-width header anchored flush to the document top and a full-width footer anchored flush to the document content bottom. The header may contain canopy or leaves and must dissolve into alpha along its bottom/inward edge. The footer may contain ground, grass, flowers, mushrooms, or insects and must emerge from alpha along its top/inward edge. Put one solid code-native page color behind both assets and the variable-height middle so the complete document reads as one smooth scene without stretching artwork.
- The edge assets frame the document, not the viewport. They must not be fixed or sticky unless an established shell explicitly reserves their space. Keep them clear of app headers, safe areas, bottom navigation, and bottom actions.
- Portrait usually benefits from taller top edge framing, compact characters, and a strong ground footer. Landscape can extend the same vocabulary laterally and use shallower, wider header/footer artwork. Generate distinct portrait and landscape edge assets when their aspect ratios require recomposition; never stretch one orientation into the other.
- Reserve content-safe regions before generating artwork. Decorative density must not compete with labels, fields, lists, cards, or navigation.
- Add small flowers, leaves, insects, or similarly restrained accents beside existing headings, categories, dividers, or card corners only where the captured layout has spare space. Treat them as absolute decorative overlays or background layers with no layout participation. Do not add decorative containers, badges, labels, or ornamental frames that alter the page's presentation.
- Use depth deliberately: background atmosphere, middle-ground scenery, foreground edge framing, then code-native UI. Decorative layers use `pointer-events: none`.
- Avoid photographic realism, hard plastic 3D, random sticker collections, excessive sparkles, noisy micro-detail, baked text, and inconsistent character anatomy.

## Natural scene logic

Every object needs a believable support, attachment, scale, and relationship to nearby scenery. Classroom objects belong on desks, shelves, paths, signs, bags, or in a character's hands—not dangling from branches, growing from leaves, floating in the sky, or merging into trunks. Natural elements should also connect plausibly: flowers grow from soil, insects perch or fly, and branches join trunks cleanly.

Fantasy is allowed only when the administrator or established art direction explicitly calls for it. Even then, make the magical behavior deliberate and readable rather than an accidental generation artifact. Reject floating objects, impossible gravity, fused silhouettes, accidental overlaps, and tangencies that make separate objects look attached.

## Theme neutrality

The canonical artwork represents a timeless cheerful environment, not a time of day. Shared backgrounds must not contain sun, moon, stars, night gradients, sunrise, sunset, or lighting that only makes sense in one theme.

Light mode uses canonical artwork. Dark mode reuses it without moving or swapping scenery and applies a CSS overlay plus dark surface/text/border tokens. Start near `rgba(16, 18, 48, .48)` and adjust through rendered comparison. Do not crush foliage into black or reduce body-text contrast.

If an explicitly requested celestial or seasonal item is needed, isolate it as an optional cut asset. Never make it inseparable from the shared background.

## Quality bar

Reject work that feels auto-filled: empty gradients with a few stickers, generic repeated flowers, characters unrelated to the page task, a full screenshot used as a background, implausibly placed props, or decorations that reshape the UI. A finished design preserves the source page's presentation while adding coherent background or edge framing, believable scene logic, balanced color, and restrained section accents.
