# Localization Guidelines

- Support English (`en`) and Vietnamese (`vi`) for every page, form, field, table, option, status, error, confirmation, tooltip, and accessible name.
- Store desktop strings under `src/renderer/locales/en.json` and `src/renderer/locales/vi.json` using matching key paths.
- Scope keys by feature and concept; reuse common action keys only when meaning and grammar match.
- Do not hardcode visible strings or use silent fallback/default text.
- Use interpolation and pluralization through the shared localization layer.
- Build form schemas and table columns from translated values so language changes update the complete surface.
- Validate locale JSON and ensure corresponding English/Vietnamese keys exist.
- Prefer natural Vietnamese product language over literal translation.
- Verify longer labels wrap without overlap, hidden values, or actions leaving the viewport.
