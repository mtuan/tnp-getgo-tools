# GetGo Tools Engineering Instructions

This desktop repository follows the same engineering principles as `tnp-getgo-web`, adapted for Electron and local quiz repositories.

- For UI work, read and follow `.agents/ui-ux/AGENTS.md` and the task-specific files it links.
- Read an existing shared component's implementation and TypeScript contract before using or extending it. Do not guess its behavior from its name.
- Prefer shared schema-driven fields, modal primitives, tables, state components, and animation utilities over raw or page-specific controls.
- Keep renderer UI, reusable domain logic, repository persistence, Electron IPC, and preload APIs separate.
- Renderer components must never access Node.js, the filesystem, or Electron directly. Use the typed preload API; keep validation and filesystem rules in core/repository modules.
- Localize every user-facing string and accessible name in English and Vietnamese. New locale infrastructure belongs under `src/renderer/locales`.
- Preserve accessibility, keyboard behavior, responsive layouts, loading states, reduced motion, and light/dark themes.
- Reuse GetGo Web's visual language and interaction contracts so equivalent controls behave consistently across both applications.
- Keep security boundaries intact: context isolation on, Node integration off, sandbox on, validated IPC inputs, and allowlisted external URLs.
- Run `npm run typecheck`, targeted tests, and `git diff --check` before reporting a change complete. Run the production build when build configuration or packaging is affected, or when the user requests it.
- Preserve unrelated user changes in a dirty worktree.

## Architecture boundaries

- `src/renderer`: presentation, interaction state, localized schemas, and renderer-only shared UI.
- `src/core`: portable models, schemas, validation, and pure domain logic.
- `src/repositories`: local repository scanning and persistence; no React or UI concerns.
- `src/main`: Electron lifecycle and narrow IPC orchestration; delegate domain/persistence work.
- `src/preload`: the minimal typed bridge exposed to the renderer.
- Tests should exercise core and repository behavior without requiring the UI.

Do not put persistence rules in React components or duplicate domain validation in IPC handlers. Client validation improves UX; core/repository validation remains authoritative.
