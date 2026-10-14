---
name: audit-getgo-marketplace-defaults
description: Audit or normalize GetGo content-v2 topic and quiz marketplace defaults, including Premium inheritance, Free oldest quizzes, and newest guest previews. Use when checking or repairing marketplace policy in a tnp-getgo-quizzes repository.
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
- Up to 4 of the oldest quizzes are Free according to topic size, capped at
  `floor((quizCount - 1) / 2)` so inherited Premium quizzes remain the majority;
  all others inherit Premium pricing from the topic.
- One newest quiz enables guest preview, or two when the topic has more than 10
  quizzes. Select previews by newest `order`, then quiz ID.

After applying, run the audit command again and report any remaining issues.
Treat malformed records and schema errors as blockers; do not bypass them or
silently widen the requested topic scope.

Applying this skill may change only topic `preview`, `experimental`, and
`pricing`, quiz pricing inheritance, and the selected quiz `preview` flags.
Preserve tags, titles, descriptions, contest metadata, language fields, field
ordering, and every other unrelated value exactly.
