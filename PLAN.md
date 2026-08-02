# GetGo Tools Desktop Plan

## Goal

Build a cross-platform desktop control center for managing local GetGo quiz
repositories, their content lifecycle, build readiness, and environment-specific
upload status. The quiz repository remains the source of truth; the desktop app
is an operator interface and rebuildable local index.

## Architecture

```text
React renderer
  -> typed preload API
    -> Electron main process
      -> application services
        -> quiz repository adapter (manifest.json + generated artifacts)
        -> local settings/index
        -> pipeline adapter (validate/build/publish)
        -> Firebase adapter (Storage + Firestore)
```

### Boundaries

- `tnp-getgo-quizzes` owns quiz content, manifests, generated artifacts, and the
  content processing workflow.
- `tnp-getgo-tools` owns desktop workflows, job orchestration, local preferences,
  cached operational state, and remote-status reconciliation.
- Quiz tools must ultimately be reusable headless libraries. Both the existing
  CLI and this desktop app should call those libraries; parsing CLI output is
  only an interim integration option.
- The renderer is untrusted: it has no direct Node, filesystem, credential, or
  Firebase access. A narrow preload API validates IPC inputs and results.

## Status model

Content lifecycle comes from the quiz manifest:

```text
imported -> normalized -> generated -> reviewed -> validated -> published
```

Deployment status is separate and environment-specific:

```text
not-built | not-uploaded | uploading | uploaded | outdated | failed | unknown
```

An upload is current only when its remote artifact hash equals the current local
artifact hash. A manifest's `published` lifecycle value alone is not proof that
the latest local build is deployed.

## Target structure

```text
src/
  main/             Electron lifecycle, secure IPC, settings
  preload/          Typed renderer bridge
  renderer/         React application and feature UI
  core/             Domain types and status derivation
  repositories/     Local quiz repository scanning
tests/               Domain and repository integration tests
```

As the application grows, extract `core`, repository, pipeline, Firebase, and
persistence code into workspace packages without changing their contracts.

## Desktop layout

- Sidebar: Dashboard, Quizzes, Jobs, Publishing, Settings.
- Top bar: selected repository, environment, rescan/open controls.
- Dashboard: total quizzes, lifecycle counts, build readiness, and upload state.
- Quizzes: searchable/filterable table with multi-select-ready row design.
- Quiz details: metadata, files, validation/build state, deployments, and history.
- Jobs: queued/running/completed operations with streaming logs and cancellation.
- Publishing: dry run, environment confirmation, progress, verification, retry.

## Delivery phases

### Phase 1 — local repository MVP

- Electron + React + TypeScript desktop shell for macOS and Windows.
- Select and persist a quiz repository.
- Scan and validate quiz manifests.
- Discover generated manifests and derive build/upload readiness.
- Dashboard, filters, quiz list, and quiz detail panel.
- File watching/rescan and actionable scan errors.

### Phase 2 — pipeline jobs

- Extract or adapt inventory, validation, and build APIs from
  `tnp-getgo-quizzes`.
- Durable job model with structured progress events, logs, cancellation, retry,
  and bounded concurrency.
- Open files/folders in the configured external editor.

### Phase 3 — remote reconciliation

- Firebase profile configuration with secrets stored in the OS credential store.
- Compare local artifact hashes with Cloud Storage/Firestore metadata for each
  environment.
- Store observations and job history in SQLite as a rebuildable local index.

### Phase 4 — safe publishing

- Enforce validate -> build -> dry run -> confirm -> upload -> verify.
- Explicit production confirmation and persistent environment indicator.
- Batch publish with per-quiz retry and concurrency locks.
- Signed/notarized installers, CI builds, and application updates.

## MVP acceptance criteria

- The app runs in development and creates a production desktop bundle.
- A user can select `tnp-getgo-quizzes` on macOS or Windows.
- Quiz manifests are scanned without changing the quiz repository.
- The UI distinguishes content status from local deployment/build status.
- Search and status filters work, and malformed manifests surface as scan issues.
- Type checking, automated tests, and production builds pass.
