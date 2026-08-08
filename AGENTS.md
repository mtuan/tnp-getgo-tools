# GetGo Tools Engineering Instructions

This desktop repository follows the same engineering principles as `tnp-getgo-web`, adapted for Electron and local quiz repositories.

- For UI work, read and follow `.agents/ui-ux/AGENTS.md` and the task-specific files it links.
- Read an existing shared component's implementation and TypeScript contract before using or extending it. Do not guess its behavior from its name.
- Prefer shared schema-driven fields, modal primitives, tables, state components, and animation utilities over raw or page-specific controls.
- Feature code must use the shared components in `src/renderer/ui` for interactive controls and established UI patterns. Do not add raw buttons, ad-hoc icon buttons, tabs, form controls, dialogs, tables, loading indicators, or page-specific substitutes when a shared primitive exists; extend or add a shared `ui` primitive first when one is missing.
- All feature forms must be schema-driven through the shared `Form`/`FormSchema` system, including dynamic or repeatable sections via shared custom fields such as `EditTable`. Do not hand-compose labeled inputs or maintain a parallel page-specific form system.
- Icon buttons must use the shared `Button` component with `variant="icon"`. Keep them simple, borderless, and free of rotate, scale, spring, or novelty hover animations; only use restrained color/background state changes.
- Keep renderer UI, reusable domain logic, repository persistence, Electron IPC, and preload APIs separate.
- Renderer components must never access Node.js, the filesystem, or Electron directly. Use the typed preload API; keep validation and filesystem rules in core/repository modules.
- Localize every user-facing string and accessible name in English and Vietnamese. New locale infrastructure belongs under `src/renderer/locales`.
- Preserve accessibility, keyboard behavior, responsive layouts, loading states, reduced motion, and light/dark themes.
- Reuse GetGo Web's visual language and interaction contracts so equivalent controls behave consistently across both applications.
- Keep security boundaries intact: context isolation on, Node integration off, sandbox on, validated IPC inputs, and allowlisted external URLs.
- Run `npm run typecheck`, targeted tests, and `git diff --check` before reporting a change complete. Run the production build when build configuration or packaging is affected, or when the user requests it.
- Preserve unrelated user changes in a dirty worktree.

## Professional conduct and change discipline

- **Never play dumb.** Do not ignore information the user already provided, ask them to repeat established context, pretend not to understand a clear request, deny repository behavior without inspecting it, or knowingly choose a more complicated interpretation than the straightforward one.
- Work ethically, professionally, and in the user's interest. Never misrepresent progress, invent requirements, deliberately prolong work, or introduce unnecessary complexity that wastes the user's time or resources.
- Read and trace the existing implementation before changing it. State what the current flow already does, identify the smallest missing behavior, and preserve everything outside that behavior.
- Implement the narrowest change that satisfies the request. Do not redesign architecture, replace working APIs, alter lifecycle semantics, or broaden routing/state behavior when a localized change is sufficient.
- Do not pretend an existing capability is absent. Verify it in code first, then build on it. When the user describes existing behavior, treat that as an explicit constraint and confirm it against the repository before editing.
- Before editing, identify the exact call path and regression risks. After editing, inspect the final diff to ensure only intended files and behaviors changed, then run proportionate validation.
- If a change causes a regression, stop extending it. Revert the incorrect part immediately, restore the last working behavior, and apply a smaller correction.
- Be transparent about mistakes and uncertainty. Do not use speculative explanations as justification for additional work; verify the cause with repository evidence.
- Optimize for correct outcomes and minimal user effort, not the amount of code written or time spent.

## Architecture boundaries

- `src/renderer`: presentation, interaction state, localized schemas, and renderer-only shared UI.
- `src/core`: portable models, schemas, validation, and pure domain logic.
- `src/repositories`: local repository scanning and persistence; no React or UI concerns.
- `src/main`: Electron lifecycle and narrow IPC orchestration; delegate domain/persistence work.
- `src/preload`: the minimal typed bridge exposed to the renderer.
- Tests should exercise core and repository behavior without requiring the UI.

Do not put persistence rules in React components or duplicate domain validation in IPC handlers. Client validation improves UX; core/repository validation remains authoritative.
