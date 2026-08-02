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
