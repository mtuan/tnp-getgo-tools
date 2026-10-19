# GetGo deployment configuration

GetGo Tools owns the environment profiles and the assembled Firebase deployment workspace.

- `getgo-dev`, `getgo-staging`, and `getgo` contain the development, staging, and production profiles.
- Each `target.json` identifies the Firebase project, URL, region, Function codebases, and public Web environment file.
- Firebase configuration, rules, indexes, and Function directories are generated here at build time and ignored by Git.
- The Hosting contract and PWA manifest come from `tnp-getgo-web/configs/web/getgo`.
- Rules, indexes, Function sources, and the Function package template come from `tnp-getgo-logics`.
- Immutable bundles and deployment history are stored in `tnp-getgo-releases`.
- Incremental CLI state is stored in `tnp-getgo-tools/.state/deployments` and is never committed.

Deployment and release orchestration is implemented under `tnp-getgo-tools/scripts/deployment`. `tnp-getgo-web` consumes these profiles to build the Web artifact, but does not own deployment targets, orchestration, or deployment state.
