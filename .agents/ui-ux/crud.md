# CRUD UI Guidelines

- Keep list/detail presentation in the renderer and persistence in repository services behind typed preload APIs.
- Use shared tables, empty states, form schemas, modal primitives, and confirmation controls.
- Use a row click for the primary row action and stop nested action controls from triggering it.
- Use detail pages for entities with substantial related data; use focused editors for create/edit.
- Keep one editor state identifying closed, create, or the selected edit record.
- Create mode must not append provisional records or mutate repository data before save succeeds.
- Use the same editor/form for create and edit when their fields substantially match.
- Footer order: `Delete (edit only) | flexible space | Cancel | Create/Save`.
- Delete must require an accessible localized confirmation. Prefer recoverable Trash operations when supported.
- Keep the editor open on failure and show localized actionable errors.
- Cancel, close, backdrop, and Escape must share one cleanup path and must not mutate or rescan data.
- Reconcile the canonical returned snapshot/record after success. Avoid unrelated refetching or renderer-side data shaping.
- Keep heavy table props referentially stable when editor state changes.
