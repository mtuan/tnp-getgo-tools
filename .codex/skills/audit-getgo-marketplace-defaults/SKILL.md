---
name: audit-getgo-marketplace-defaults
description: Audit or normalize GetGo content-v2 topic and quiz marketplace defaults, including Premium inheritance and exactly one reviewed guest-preview quiz per topic. Use when checking or repairing marketplace policy in a tnp-getgo-quizzes repository.
---

# Audit GetGo marketplace defaults

Read `../../../MARKETPLACE_POLICIES.md` before auditing or applying changes.
Treat it as the maintained policy guide; this skill defines only the operational
guardrails.

Use the repository-owned command from `tnp-getgo-tools`:

```powershell
npm run marketplace:defaults -- --repository <tnp-getgo-quizzes-path> [--topic <topic-id>] [--apply]
```

Run without `--apply` first. Report every affected topic and proposed change.
Only use `--apply` after the user explicitly authorizes updating the resolved
scope. Do not publish or sync Firebase as part of this workflow.

The maintained policy is:

- A topic enables guest preview, is not experimental, and uses Premium
  (`pricing.type = "subscription"`).
- Quiz pricing inherits from its topic unless it has a supported intentional
  override.
- Exactly one eligible quiz per topic enables guest preview. An eligible quiz
  has at least one question and every question is reviewed.
- Preserve an eligible quiz already selected for preview. Otherwise select the
  first eligible quiz by `order`, then by quiz ID.
- If no quiz is eligible, leave every quiz preview disabled and report that the
  topic is waiting for a reviewed quiz.

After applying, run the audit command again and report any remaining issues.
Treat malformed records and schema errors as blockers; do not bypass them or
silently widen the requested topic scope.

Applying this skill may change only topic `preview`, `experimental`, and
`pricing`, quiz pricing inheritance, and the selected quiz `preview` flags.
Preserve tags, titles, descriptions, contest metadata, language fields, field
ordering, and every other unrelated value exactly.
