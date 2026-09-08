# Standalone design generator

The generator creates exactly one page package per run.

## Demo mode

Demo mode uses only the selected design project's `project.json`, mandatory `art-direction.md`, page name, and administrator prompt. It does not read Screenshot Manager data, `pages.json`, screenshots, or DOM snapshots.

```sh
npm run design:generate -- \
  --mode demo \
  --project login-api-design \
  --name "Login" \
  --prompt "Create a login choice page with Google, Facebook, Apple ID, email login, email registration, and legal links."
```

The output contains `design.json`, `generation-manifest.json`, `validation-report.json`, `alpha-report.json`, isolated transparent PNG assets, and four HTML/rendered PNG demos: portrait/landscape in light/dark themes. A detailed run result is always written to `<design-project>/runs/<run-id>.json`.

## Page mode

Use `--mode page` (the default) when the prompt must be combined with a selected page from Screenshot Manager `analysis/pages.json`.

## Style-reference mode

Use `--mode reference` with a design project that selects exactly one Screenshot Manager capture. The request sends three page inputs to OpenAI: the current-page screenshot, only that route's structure/content from `analysis/pages.json`, and `docs/getgo/kids-friendly-iphone-ui/demos/login-light.png`.

The Login demo is strictly a style reference for theme, illustration language and quality, color palette, texture, lighting, character language, and polish. It is not a layout reference: the model is explicitly forbidden from copying its geometry, spacing, control placement, content, or Login-specific composition.
