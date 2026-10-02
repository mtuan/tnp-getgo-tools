---
name: migrate-getgo-v1-to-content-v2
description: Migrate or refresh selected current GetGo v1 quizzes from tnp-tools data/getgo/quizzes through the safe tnp-getgo-quizzes content staging area into content-v2, optionally converting static v2 questions to current dynamic QuizBuilder records. Use for one pipeline stage, an exact per-question refresh, or the complete migration, with contest, round, grade, quiz, prefix, and topic-grouping scopes. Do not use the legacy tnp-getgo-quizzes/quizzes tree as source.
---

# Migrate GetGo v1 to content-v2

Use the newest v1 quiz data as the only import source:

`C:\Works\tnp\projects\git\tnp-tools\data\getgo\quizzes`

Stage imports under `tnp-getgo-quizzes/content`, promote them deterministically
to `tnp-getgo-quizzes/content-v2`, then optionally dynamize static v2 questions.
Never source quiz content from `tnp-getgo-quizzes/quizzes`.

Before acting, read [references/pipeline-contract.md](references/pipeline-contract.md).

## Select a mode

Honor an explicitly requested mode. Otherwise use `all` only when the user asks
for the complete migration.

- `import`: current v1 source -> `content` only.
- `refresh-question`: refresh one exact source quiz question in `content` only;
  promote or dynamize that question only when separately requested.
- `promote`: selected staged `content` topics -> `content-v2` only.
- `dynamize`: selected static questions already in `content-v2` only.
- `all`: run `import`, `promote`, then `dynamize`, stopping if a stage fails.
- `verify`: compare source, staging, and v2 without writing.

Do not interpret a request for one stage as authorization to run later stages.

## Resolve the scope

Accept any useful combination of contest, round, grade, year, exact quiz ID,
anchored folder prefix, an exact question number for `refresh-question`,
explicit question numbers for `dynamize`, destination topic ID, replacement
authorization, and grouping rule. Make selection
deterministic. Print the resolved source folders and destination topics during
dry-run. Reject ambiguous matches instead of silently widening the scope.

Grouping is configurable. Support at least:

- one source quiz -> one destination topic;
- all selected quizzes -> one topic;
- group by contest;
- group by contest + round;
- group by contest + grade + round.

For competition grouping, derive the default topic ID as
`<contest>_<grade>_<round>`. For example, select every source folder matching
the resolved TIMO grade-1 preliminary scope, such as `timo_1_pr_*`, and group
its distinct quizzes under topic `timo_1_pr`. Likewise, `timo_1_hr_*` maps to
`timo_1_hr`. Preserve every distinct source quiz even when metadata duplicates
another quiz.

Resolve contest, grade, and round primarily from quiz metadata. Cross-check
them against the source folder pattern. Use the folder pattern only as fallback
when metadata is missing or invalid. If valid metadata conflicts with the
folder name, report the conflict and do not group or write that quiz silently.

Every competition topic must store its normalized contest identifier in the
top-level `contestId` field, independently of the grouped topic ID. For
example, `timo_1_pr`, `timo_1_hr`, and their hyphenated v2 IDs all use
`"contestId": "timo"`. Do not require consumers to infer the contest from a
topic ID, title, tag, or source folder name.

If topic naming or grouping is not inferable without changing the resulting
catalog structure, ask for the missing choice before writing. A dry-run or
inventory may proceed without that choice.

## Execute safely

1. Inventory and dry-run the selected stage before any write.
2. Reuse and narrowly generalize the maintained converter instead of creating
   contest-specific copies. It must read `raw.json`, `raw.ts`, and `assets/`
   from the selected current-source folders.
3. For `refresh-question`, require one exact source quiz folder and one positive
   question number. Rebuild only the matching `qN.json`, preserve its stored
   review status and feedback, refresh its compiled dynamic artifact, copy
   required quiz assets, and leave every other topic record untouched. Require
   replacement authorization after dry-run. Do not automatically promote or
   dynamize the refreshed question.
4. For `promote`, use or implement a deterministic schema-v2 adapter from
   `content/topics` to `content-v2/topics`. Do not call
   `migration:content-v2:legacy` for this path: that command reads the stale
   `tnp-getgo-quizzes/quizzes` tree. Preserve and validate `contestId` during
   promotion.
5. For `dynamize`, use the repository-owned `getgo-convert-static-quiz` skill
   and its current compiler/schema/runtime checks. Never use
   `getgo-migrate-questions` on `content` or `content-v2`; it writes the legacy
   `advancedDynamic` schema.
6. Require explicit replacement authorization before overwriting an existing
   topic or quiz. Prefer staged writes and atomic replacement.
7. Never publish or deploy as part of migration unless separately requested.

## Verify each boundary

Compare selected source/output quiz and question counts, stable IDs and order,
metadata, localized text, answers, explanations, assets, and all `asset:`
references. For dynamic questions, verify origin reproduction, fresh compiled
output, the supported QuizBuilder API version, and randomized samples using the
current v2 converter checks.

Report per stage the resolved scope and grouping; source and destination paths;
created, replaced, skipped, and failed records; missing assets, origin
mismatches, schema errors, and review warnings; and whether later stages ran or
were intentionally not authorized.
