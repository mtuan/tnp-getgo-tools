# CRUD UI Guidelines

- Keep list/detail presentation in the renderer and persistence in repository services behind typed preload APIs.
- Use shared tables, empty states, form schemas, modal primitives, and confirmation controls.
- Use a row click for the primary row action and stop nested action controls from triggering it.
- Use detail pages for entities with substantial related data; use focused editors for create/edit.
- Keep one editor state identifying closed, create, or the selected edit record.
- Create mode must not append provisional records or mutate repository data before save succeeds.
- Use the same editor/form for create and edit when their fields substantially match.
- Every create/edit drawer or modal must use the shared schema-driven dynamic `Form`/`FormSchema` system. Do not assemble CRUD editors from page-local labeled controls.
- Footer order and alignment are mandatory: `Delete (edit only)` on the far left, flexible space, then `Cancel` and `Create/Save` on the right.
- Save/Create must enter the shared submitting/loading state immediately, block duplicate submission and closing, persist the form, reconcile the canonical returned record into the calling page in memory, and only then close the drawer/modal. Do not refresh the page, rescan the repository, or refetch an unrelated collection after success.
- Keep the editor open with its entered values on save failure, leave the calling page unchanged, clear the loading state, and show a localized actionable error.
- Delete must require an accessible localized confirmation. If confirmed, show the shared loading/processing state, block duplicate actions, perform the deletion, remove/reconcile the record in the calling page in memory, and only then close the drawer/modal. Do not refresh the page or rescan the repository. Prefer recoverable Trash operations when supported.
- Keep the editor open and the calling page unchanged on delete failure; clear loading and show a localized actionable error.
- Cancel, close, backdrop, and Escape must share one cleanup path and must not mutate or rescan data.
- Treat the persistence result as canonical. The caller update must use that returned snapshot/record (or returned deletion identity), not the stale submitted draft.
- Keep heavy table props referentially stable when editor state changes.
