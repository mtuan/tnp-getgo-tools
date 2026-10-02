# Pipeline contract

Read this reference before running any mode.

## Repositories and authoritative paths

| Role | Path |
|---|---|
| Current v1 source | `C:\Works\tnp\projects\git\tnp-tools\data\getgo\quizzes` |
| Safe staging | `C:\matuan\tnp-getgo\tnp-getgo-quizzes\content\topics` |
| Final v2 content | `C:\matuan\tnp-getgo\tnp-getgo-quizzes\content-v2\topics` |
| Stale legacy input; forbidden as source | `C:\matuan\tnp-getgo\tnp-getgo-quizzes\quizzes` |

Each selected source quiz normally supplies `raw.json`, `raw.ts`, and optional
`assets/`. Treat `raw.json` as canonical static content and `raw.ts` as the
current dynamic source when importing.

## Existing capabilities and gaps

The maintained v1 converter currently starts at:

`C:\Works\tnp\projects\git\tnp-tools\scripts\convert-getgo-v1-to-content.mjs`

It demonstrates AST parsing, origin comparison, compilation, asset copying,
staged writes, and single-question refresh. Its current scope is TIMO
preliminary grade 1 and its destination is `content/topics`. Generalize this
implementation with explicit selection and grouping rather than copying it for
each contest.

The package command `migration:content-v2:legacy` is not a content-to-v2
promoter. Its implementation reads `tnp-getgo-quizzes/quizzes`; never use it
for this pipeline.

Before `promote`, search for a maintained content-to-v2 adapter. If none exists,
implement one narrowly in `tnp-getgo-quizzes`, backed by the current
`schemas/content-v2` contracts. It must accept explicit source topics and must
not scan or import the legacy tree.

For v2 static-to-dynamic conversion, follow:

`C:\matuan\tnp-getgo\tnp-getgo-tools\.codex\skills\getgo-convert-static-quiz\SKILL.md`

## Scope model

Normalize the request into a scope before running:

```text
mode: import | refresh-question | promote | dynamize | all | verify
contest: optional contest directory
round: optional normalized round, for example pr/hr/fr
grade: optional grade
year: optional year or year range
quizIds: optional exact source folder IDs
prefix: optional anchored folder prefix
questionNumber: required with exact quizId for refresh-question
questionNumbers: optional, dynamize only
topicId: optional override for a resolved group
groupBy: quiz | selection | contest | contest-grade-round
replace: false unless explicitly authorized
```

Filters combine by intersection. Exact IDs take precedence over inferred
metadata. Prefix matching must use `startsWith`; never use a loose substring or
unbounded wildcard.

For competition topics, the default grouped topic ID is
`<contest>_<grade>_<round>`. Determine those values from valid quiz metadata,
then cross-check the folder prefix. Fall back to an anchored folder pattern
only when metadata is missing or invalid. A conflict between valid metadata and
the folder name is a blocking source warning; do not silently choose either.
Store the normalized contest separately as the top-level topic field
`contestId`; this value remains unchanged when promotion converts the topic ID
from underscores to hyphens.

Example for one grouped topic:

```text
contest=timo, round=pr, grade=1,
groupBy=contest-grade-round, topicId=timo_1_pr
```

This selects the resolved `timo_1_pr_*` source folders and preserves every
matching source quiz inside topic `timo_1_pr`.

Example for multiple deterministic groups:

```text
contest=ikmc, groupBy=contest-grade-round
```

Dry-run must list every resolved group before writes.

## Import invariants

- Write top-level `contestId` on every competition topic. Derive it from the
  resolved contest scope, not by later parsing the destination topic ID.
- Pair `raw.json` and `raw.ts` questions by `question_no`; fail on count/order
  mismatch.
- Parse `raw.ts` through the TypeScript AST.
- Preserve distinct source folders, stable question IDs, zero-based order, and
  review data on an authorized refresh.
- Recompile whenever dynamic source changes; never carry stale `compiledJs`.
- Evaluate origin parameters and compare generated numeric content, answer,
  and non-image choices with `raw.json`.
- Preserve image answer `asset:` references and copy every referenced asset.
- Do not copy publication hashes into refreshed staging data.

## Exact question refresh

Use `refresh-question` when one question changed in the current v1 source. It
requires an exact source folder and a positive question number; a prefix or
metadata-only selection is not precise enough for this mode.

The maintained converter currently exposes this contract:

```powershell
node scripts/convert-getgo-v1-to-content.mjs `
  --contest=<contest> --grade=<grade> --round=<round> `
  --quiz=<exact-source-folder> --question=<number> --dry-run
node scripts/convert-getgo-v1-to-content.mjs `
  --contest=<contest> --grade=<grade> --round=<round> `
  --quiz=<exact-source-folder> --question=<number> --replace
```

Generalized converters must preserve the same behavior across contests:

- still parse all source questions and pair `raw.json` with `raw.ts` before
  selecting the requested `question_no`;
- rebuild and validate only the selected question output;
- preserve an existing question's `status` and `feedback`;
- regenerate `dynamic.compiledJs` and retain the supported API version;
- revalidate the origin fixture against the updated source;
- copy and verify referenced quiz assets;
- leave `topic.json`, `quiz.json`, other questions, review fields, and unrelated
  topics unchanged.

Dry-run must report the exact source folder, source question number, resolved
topic and quiz IDs, and destination `qN.json`. Writing an existing question
requires explicit replacement authorization.

This mode updates `content` only. If the request also asks to carry the change
forward, promote only the corresponding quiz/question into `content-v2` and
preserve its v2 review state. Run `dynamize` afterward only when explicitly
requested; a source refresh does not authorize regeneration of dynamic content.

## Promotion invariants

- Output must validate against schema version 2.
- Require a valid top-level `contestId` on competition staging topics and
  preserve it unchanged in `content-v2`.
- Map `text.en`/`text.vi`, `assets`, `answer`, `explanation`, and `dynamic`
  without introducing legacy `text_en`, `image_datas`, or `advancedDynamic`
  storage fields.
- Preserve review status unless the current v2 schema requires an explicit,
  documented normalization.
- Promote only the resolved staging topics. Do not delete unrelated v2 topics.
- Compare essential content and counts before replacing an existing v2 topic.

## Dynamize invariants

- Skip verified and image-dependent questions unless explicitly included.
- Preserve schema version 2 and write the current `dynamic` contract.
- Do not run the legacy proposal scripts from `getgo-migrate-questions`.
- Validate origin output and at least 30 randomized samples per converted
  record using the current v2 skill requirements.

## Stopping conditions

Stop before writing when scope or grouping is ambiguous. Stop the pipeline on
missing source pairs, schema failure, count/order mismatch, origin mismatch,
missing assets, compilation failure, or an unauthorized replacement. Report
the failing stage; do not continue to later modes with partial output.
