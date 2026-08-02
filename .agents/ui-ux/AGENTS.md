# UI/UX Engineering Instructions

Read these instructions when changing pages, components, layouts, styling, responsive behavior, animations, accessibility, localization, or user-facing interactions.

## UI system

- Use an existing shared renderer component whenever it matches the interaction.
- Read its complete source and exported types before use or extension.
- Verify supported props, composition, defaults, keyboard behavior, loading behavior, accessibility, and variants instead of guessing.
- Extend a shared primitive when behavior applies to multiple entry points.
- Keep equivalent controls visually and behaviorally consistent with GetGo Web.
- Never substitute native controls when the shared UI system defines a corresponding styled interaction.

## Themes and color

- Every new UI must support light and dark themes.
- Use shared theme variables and semantic colors rather than isolated feature colors.
- Verify contrast for text, icons, borders, focus indicators, disabled states, overlays, and menus in both themes.

## Interaction states

- Define intentional default, hover, pressed, focus, disabled, loading, empty, error, and success states where applicable.
- Catch failures where the UI can show localized, actionable feedback.
- Keep layout stable while content loads or changes state.
- Respect `prefers-reduced-motion` and avoid transformed ancestors around fixed or portaled overlays.

## Required related guidance

- Forms or validation: read `forms.md` and `localization.md`.
- CRUD flows: read `crud.md`, `forms.md`, and `modals.md`.
- Modals, drawers, dropdowns, or overlays: read `modals.md` and `accessibility.md`.
- Async/data-dependent UI: read `loading-states.md`.
- Responsive/orientation work: read `responsive.md`.
