# GetGo Tools

Cross-platform desktop operations app for local GetGo quiz repositories.

## Development

```bash
npm install
npm run dev
```

Choose a repository containing a `quizzes/` directory, such as the sibling
`tnp-getgo-quizzes` project. The MVP reads manifests and generated artifacts;
it does not modify or publish quiz data.

## Verification and packaging

```bash
npm run check
npm run dist
```

`npm run dist` creates the platform installer in `release/`. Cross-platform
release artifacts should be produced on their target operating systems in CI.

See [PLAN.md](./PLAN.md) for architecture, status semantics, and delivery phases.
# Refreshing the vendored logics package

After changing `../tnp-getgo-logics`, run:

```sh
npm run refresh:logics
```

This checks and builds logics, replaces the vendored tarball, explicitly
installs that archive even when its version is unchanged, verifies every
installed package file byte-for-byte, synchronizes Monaco types, and checks
Tools. Restart an already-running Tools app afterward. To refresh and then
start the development app in one command, use `npm run dev:fresh`.
