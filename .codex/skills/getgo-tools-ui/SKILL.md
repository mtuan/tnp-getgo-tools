---
name: getgo-tools-ui
description: Implement or refactor React UI in the tnp-getgo-tools desktop repository consistently with its project-owned component system, layouts, routing, forms, localization, tables, drawers, buttons, accessibility, and visual conventions. Use for any GetGo Tools page, editor, dialog, navigation, settings, data table, interaction, or styling change.
---

# GetGo Tools UI

Treat the repository instructions as authoritative and ship UI that matches the existing application.

## Required preparation

1. Read `AGENTS.md` completely.
2. Read `.agents/ui-ux/AGENTS.md` completely.
3. Read every task-specific guidance file it requires, such as `forms.md`, `localization.md`, `crud.md`, `modals.md`, `accessibility.md`, `loading-states.md`, or `responsive.md`.
4. Inspect the complete source and TypeScript contract of each shared component being considered.
5. Find and compare the closest existing screen before designing the change.

## Implementation workflow

1. Keep renderer presentation, core domain logic, repository persistence, main-process IPC, and preload APIs separate.
2. Build feature interactions from `src/renderer/ui`. Extend a shared primitive there if a reusable interaction is missing.
3. Build every feature form with `Form` and `FormSchema`; use shared custom fields such as `EditTable` for repeatable data.
4. Store every visible string and accessible name in both locale files. Do not hardcode fallback UI text.
5. Use route-backed tabs when users need to resume a section. Ensure the URL tab is visible, valid for that editor type, and restored correctly.
6. Use the existing `PageHeader`, editor/sidebar, panel, data-table, drawer-footer, action-menu, badge, and responsive patterns.
7. Implement intentional loading, empty, error, disabled, keyboard, focus, narrow-window, light-theme, and dark-theme states.
8. Run `npm run typecheck`, targeted tests, and `git diff --check`. Run a production build when packaging or build configuration changes.

## Non-negotiable consistency rules

- Never replace a shared control with a raw or page-local substitute.
- Never create hand-labeled inputs when the schema form supports the field.
- Never leave an unrelated or invisible `tab` query value in the route.
- Never use decorative rotation, scale, spring, novelty motion, oversized icon tiles, or arbitrary feature colors and shadows.
- Use icon-only buttons only for compact familiar actions, through shared `Button` with `variant="icon"`, a localized accessible name, and restrained interaction states.
- Let the parent entity type choose list columns and behavior; let the record type choose its detail editor.
- Keep previews visible where the established editor pattern does so.

## Review before handoff

- Compare the finished screen beside its closest existing counterpart.
- Confirm shared controls, spacing, typography, colors, and action placement match.
- Confirm every route tab corresponds to a rendered tab.
- Confirm English and Vietnamese locale keys match.
- Confirm no persistence, filesystem, or generation logic was placed in React.
- State whether renderer hot reload is sufficient or an Electron restart is required.
