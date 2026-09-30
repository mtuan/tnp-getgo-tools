---
name: convert-getgo-v1-quizzes-to-content
description: Convert a selected group of current GetGo v1 quizzes from tnp-tools raw.json/raw.ts/assets into isolated topic/quiz/question records under tnp-getgo-quizzes content/topics. Use for scoped v1-to-content migrations, refreshes, and conversion verification; do not modify content-v2.
---

# Convert GetGo v1 quizzes to content topics

Use the maintained converter in the `tnp-tools` repository instead of manually reconstructing `QB.template` calls.

## Resolve scope

Confirm the source contest directory, exact quiz-folder prefix, destination `content/topics`, topic ID, and whether replacement is authorized. Match folders with `startsWith`, not a loose wildcard in the middle.

Never write to `content-v2`. Preserve every distinct source folder even when two quizzes have the same grade, round, and year.

## Conversion contract

- Use `raw.json` for current metadata, original text, answer, category, and explanation.
- Use `raw.ts` for `paramsGeneratorTs`, `questionGeneratorTs`, `originParamsTs`, and the explanation generator.
- Compile the composed current dynamic TypeScript while converting. Store the resulting non-empty `dynamic.compiledJs` and the current `dynamic.quizBuilderApiVersion`; a source-only dynamic record is not publishable.
- Never preserve a previous `compiledJs` after changing any dynamic source field. Recompile it so the artifact cannot become stale.
- Do not assume the `raw.ts` origin fixture is correct. Evaluate `questionGeneratorTs` with `originParamsTs` and compare the generated numeric text parameters, correct answer, and non-image choices with the canonical question in `raw.json`. Treat any mismatch as a conversion error and fix the source fixture or generator before writing output.
- Treat serialized image data in `raw.json` as a runtime artifact, not canonical content. For `image_choice`, preserve the answer type and `asset:` choice references from `raw.ts`; never store base64 choice values.
- Parse `raw.ts` with the TypeScript AST. Do not split `QB.template` with regular expressions.
- Pair questions by `question_no` and fail on count/order mismatch.
- Store each question independently with stable `q<number>` IDs and zero-based `order`.
- Populate question `assets` only from `image_datas`. Do not add answer-choice images to this list, because the editor renders every item in `assets` as question content.
- Copy quiz-local assets and verify every emitted `asset:` reference from both question content and answer choices exists.
- Do not carry `publishedHash` or `publishedAt` into refreshed content.
- Keep converted questions pending for editorial review unless the administrator explicitly requests another status.

## Run and verify

The current converter entrypoint is `tnp-tools/scripts/convert-timo-1-pr-to-content.mjs`. Run from the `tnp-tools` root:

```powershell
node scripts/convert-timo-1-pr-to-content.mjs --dry-run
node scripts/convert-timo-1-pr-to-content.mjs --replace
```

For an isolated question refresh, select the exact source folder and question number. This updates only that question, preserves its stored review status and feedback, and leaves every other topic file untouched:

```powershell
node scripts/convert-timo-1-pr-to-content.mjs --quiz=<source-folder> --question=<number> --dry-run
node scripts/convert-timo-1-pr-to-content.mjs --quiz=<source-folder> --question=<number> --replace
```

To repair or upgrade compiled artifacts without reconverting question content or
changing review status/feedback, run:

```powershell
node scripts/convert-timo-1-pr-to-content.mjs --compile-existing --dry-run
node scripts/convert-timo-1-pr-to-content.mjs --compile-existing
```

Always run `--dry-run` first. Use `--replace` only when the request authorizes refreshing an existing topic.

Before completion, verify source/output quiz counts, matching JSON/template counts, valid JSON, unique complete question IDs/orders, all four dynamic source fields, a non-empty freshly generated `compiledJs` and supported `quizBuilderApiVersion` for every dynamic question, origin-fixture generation against `raw.json`, no base64 under `answer`, exact answer-choice counts, resolvable content/choice assets, and no changes under `content-v2`.

If validation exposes pre-existing source defects, do not weaken or bypass the check. Correct `raw.ts` so its origin fixture reproduces the original question, then rerun `--dry-run`. This includes fixing the parameter generator when its rule cannot generate the source example.

If a new scope needs different selection or topic metadata, generalize the maintained converter narrowly instead of copying it into an ad-hoc script.
