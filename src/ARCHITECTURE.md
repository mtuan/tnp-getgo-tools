# GetGo Tools source structure

The application uses feature-first ownership:

- `app/`: Electron and React composition roots.
- `features/<feature>/domain/`: feature rules and data contracts.
- `features/<feature>/repository/`: direct filesystem persistence.
- `features/<feature>/main/`: Electron services and IPC registration.
- `features/<feature>/pages/`: route-level React screens.
- `features/<feature>/components/`: feature-specific React UI.
- `shared/domain/`: contracts shared by multiple features.
- `shared/ui/`: reusable presentation components without feature behavior.
- `shared/components/`: reusable application-shell components.
- `shared/localization/`: shared locale resources.
- `main/` and `renderer/`: thin runtime-compatible entrypoints and renderer assets.
- `preload/`: the Electron preload boundary.

New behavior belongs to the narrowest feature that owns it. Cross-feature imports
should target an explicit domain, repository, main, page, or component module;
do not recreate generic `core`, `services`, or `utils` dumping grounds.

Repository modules operate on the configured content folders directly. They must
not introduce repository-wide caches, background scans, or bookkeeping as a side
effect of a focused read or write.
