# GetGo Marketplace Policies

This document is the authoritative guide for marketplace defaults applied to
GetGo `content-v2` topics and quizzes. The executable policy remains in
`src/features/topics/domain/marketplace-default-policy.ts`; documentation,
Tools workflows, migration, and audit automation must stay aligned with it.

## Policy goals

- New content receives safe, consistent marketplace defaults.
- Premium access is defined once at topic level and inherited by quizzes.
- Guest users can preview a topic through one or two of its newest quizzes.
- Migration and manual authoring use the same deterministic rules.
- Applying marketplace policy never publishes or syncs Firebase implicitly.

## Topic defaults

Every new topic receives:

```json
{
  "marketplace": {
    "preview": true,
    "experimental": false,
    "pricing": {
      "type": "subscription",
      "currency": "VND"
    }
  }
}
```

The Tools UI labels these values as:

| Stored value | UI meaning |
|---|---|
| `preview: true` | Available for guest preview: Yes |
| `experimental: false` | Visible to normal users when otherwise listed |
| `pricing.type: "subscription"` | Premium |
| `pricing.type: "paid"` | Exclusive; not the Premium default |

`experimental: true` is reserved for administrative or test content. It must
not be used as the system default because normal users cannot discover that
topic.

## Quiz defaults and pricing inheritance

A new quiz starts with guest preview disabled:

```json
{
  "marketplace": {
    "preview": false
  }
}
```

Do not duplicate Premium pricing on every quiz. When quiz
`marketplace.pricing` is absent, its effective access is inherited from the
topic. A quiz under a Premium topic is therefore Premium without storing
`pricing.type: "subscription"` again.

An intentional quiz pricing override is allowed only when the owning workflow
explicitly supports and preserves it. Audit/apply must report a conflicting
override before removing it.

## Quiz access allocation

For each non-experimental topic, the local access-management workflow sets the
topic to Premium and allocates quiz access by canonical `order`, then quiz ID:

- up to 5 quizzes: 1 newest preview and up to 2 oldest Free quizzes;
- 6–10 quizzes: 1 newest preview and up to 3 oldest Free quizzes;
- more than 10 quizzes: 2 newest previews and up to 4 oldest Free quizzes;
- every other quiz removes its explicit pricing and inherits Premium access.

The Free count is capped at `floor((quizCount - 1) / 2)`, so inherited Premium
quizzes always remain the majority. For example, topics with 3 or 4 quizzes
receive only 1 Free quiz.

Free and preview selections may overlap for very small topics.

Selection is deterministic:

1. Select the newest quizzes by descending `order`, then quiz ID.
2. When a user explicitly selects another quiz, prefer that quiz while
   preserving the configured preview count.

The policy is reconciled after saving a quiz, saving a question, marking all
questions reviewed, and deleting a quiz. Consequently, removing a selected quiz
causes the next newest quiz to be selected automatically.

## Tools authoring flow

New topic:

```text
Topics > More > Create topic
  -> content-v2:topic:save
  -> saveContentV2Topic()
  -> withMarketplaceTopicDefaults()
```

New quiz:

```text
Topic detail > Add quiz
  -> content-v2:quiz:save
  -> saveContentV2Quiz()
  -> withMarketplaceQuizDefaults()
  -> reconcileContentV2GuestPreview()
```

Defaults are applied when the destination `topic.json` or `quiz.json` does not
already exist. Editing existing content does not blindly replace intentional
marketplace fields; reconciliation only enforces the single eligible preview
selection.

## Audit and update existing content

Run commands from the `tnp-getgo-tools` repository. Audit is read-only by
default:

```powershell
npm run marketplace:defaults -- `
  --repository C:\matuan\tnp-getgo\tnp-getgo-quizzes
```

Limit the audit to one topic:

```powershell
npm run marketplace:defaults -- `
  --repository C:\matuan\tnp-getgo\tnp-getgo-quizzes `
  --topic timo-pr-1
```

Review the dry-run output before applying changes:

```powershell
npm run marketplace:defaults -- `
  --repository C:\matuan\tnp-getgo\tnp-getgo-quizzes `
  --topic timo-pr-1 `
  --apply
```

After apply, run the same command again without `--apply`. A clean result must
have no policy errors. A warning that the topic is waiting for a reviewed quiz
is valid and must not cause an unreviewed or empty quiz to be exposed.

`--apply` changes local repository files and may mark their publish state dirty.
It does not publish, synchronize Firebase, or broaden the requested topic
scope.

Audit/apply is field-scoped. It must preserve `tags`, titles, descriptions,
contest metadata, supported languages, field ordering, and every value outside
the approved marketplace policy fields. Use the dedicated marketplace patch
repository functions; do not route maintenance through a general topic save
that performs unrelated normalization.

## Migration integration

The `migrate-getgo-v1-to-content-v2` workflow applies this policy only after a
successful `promote` stage, including `promote` inside `all`:

1. Resolve and report the exact promoted topic IDs.
2. Run marketplace audit for each topic during migration dry-run.
3. After promotion apply is explicitly authorized, run marketplace `--apply`
   only for topics actually promoted.
4. Audit those topics again without `--apply`.

Do not run marketplace apply for `import`, `refresh-question`, or `dynamize`
alone. Do not publish or sync Firebase as part of migration.

For reviewed topic or quiz manifests, normalization is a narrow exception that
may modify only `marketplace` fields in the authorized promoted scope. Preserve
status, questions, dynamic code, feedback, assets, IDs, order, and all unrelated
metadata. It never authorizes `--overwrite-reviewed`.

## Implementation map

| Responsibility | Location |
|---|---|
| Pure defaults and selection | `src/features/topics/domain/marketplace-default-policy.ts` |
| File persistence and reconciliation | `src/features/topics/repository/content-v2-repository.ts` |
| Tools save/review/delete hooks | `src/features/topics/main/content-v2-crud-ipc.ts` |
| Audit/apply command | `scripts/audit-marketplace-defaults.ts` |
| Audit skill | `.codex/skills/audit-getgo-marketplace-defaults/SKILL.md` |
| Migration skill | `.codex/skills/migrate-getgo-v1-to-content-v2/SKILL.md` |

When changing the policy, update the pure policy, tests, this document, and the
two operational skills together. Run typecheck, marketplace-policy tests, the
full test suite, and both skill validators before handoff.
