---
name: getgo-convert-static-quiz
description: Convert static GetGo content-v2 quiz questions into dynamic QuizBuilder questions by inspecting nearby quiz records and the repository's current compiler, schema, persistence, and QuizBuilder implementations. Use for a whole quiz or selected static questions. Do not use for verified or image-dependent questions unless the user explicitly includes them.
---

# GetGo Static Quiz Converter

Use repository code and stored quiz records as the only source of truth. Do not rely on prose playbooks or generated authoring documentation.

## Inspect before editing

1. Read every requested question record in `tnp-getgo-quizzes/content-v2/topics/<topic>/quizzes/<quiz>/questions/`.
2. Read `quiz.json` and find the closest established dynamic questions in the same topic by mathematical structure, parameter shape, and answer interaction. Exclude every question being converted from the reference pool.
3. Read the applicable examples and live implementation paths in [references/code-map.md](references/code-map.md), following imported helpers when behavior is unclear.
4. Confirm how the Tools editor serializes and saves a dynamic question before changing stored records.
5. Exclude any record with `verified: true`. Do not convert an image-dependent question unless the user explicitly requests it and the dynamic output can preserve the image behavior.

## Convert each question

1. Preserve the original learning objective, difficulty, response type, and explanation intent. Treat `quiz.json.supportedLanguages` as the source of truth for localized question and explanation fields.
2. Replace fixed incidental values with bounded parameters that always generate a valid problem. Preserve intentional constants. Story names that merely personalize a question are incidental: generate them with `QB.vi.name()`, `QB.vi.names(...)`, `QB.vi.person(...)`, or `QB.vi.people(...)`; keep a fixed name only when that identity is mathematically or semantically essential.
3. Support every language declared by `quiz.json.supportedLanguages`, and only those languages, for both the question and its explanation:
   - For `"en"`, generate non-empty `text_en` and `explanation.en`.
   - For `"vi"`, generate non-empty `text_vn` and `explanation.vi`.
   - If both are supported, author equivalent English and Vietnamese content from the same parameters and mathematical objects. Do not make one locale a structural afterthought or wrap both languages into one field.
   - Omit unsupported localized generator fields rather than persisting empty placeholder strings. Existing empty unsupported-language fields are legacy data, not a pattern to copy.
   - When the static record lacks a required supported-language variant, translate it faithfully without changing the learning objective, mathematical constraints, answer, units, names, or difficulty.
4. Prefer existing `QB` helpers and the closest matching code pattern. Do not invent a new representation, parallel runtime, formatter, or evaluator when the topic already demonstrates the construct.
5. Keep generated and origin parameters limited to independent source facts. Calculate answers, choices, expressions, display strings, transliterations, and other derived values inside `questionGeneratorTs` or `explanationGeneratorTs`. For a Latin identifier derived from a Vietnamese name, use `QB.vi.toLatin(name)` and apply casing at the use site; do not generate or store a separate prefix parameter.
6. Express bounds and constraints through the values they depend on so the relationship remains correct when the source changes. Do not repeat a coincidental literal bound. For example, after `const digits = QB.rnd.ints(3, 1, 9, { unique: true })`, choose an index with `const pos = QB.rnd.int(0, digits.length - 1)`, not `QB.rnd.int(0, 2)`. Apply the same rule to collection lengths, ranges, counts, and dependent limits throughout parameter generation.
7. Make `originParamsTs` reproduce the generated parameter keys, shapes, and runtime types exactly. Prefer a plain object; use a callback only when reconstructing runtime objects or declaring intermediate values is necessary.
8. Give distinct story roles distinct parameter names. Destructure generated names immediately and return the named roles. Keep an array when the values genuinely form one mathematical collection, and destructure it locally where its components are used.
9. Generate valid values constructively with existing constraints such as `unique`, `sorted`, `step`, `odd`, or `even`, or by deriving dependent values algebraically. Do not rely on unbounded retries.
10. Match the source interaction with the established answer helper: `input`, `multiple`, `nested`, `choice`, or `choiceCompare`. Put units in answer metadata and rely on input-type inference unless the source contract needs an explicit type.
    - A nested part that accepts several values must keep `correct` as an array. `QB.answer.nested` creates the nested `multiple_answer` contract; never flatten the values with `join(...)` into one text input.
11. Keep raw values in parameters and render them through the applicable helper in the question: `QB.fmt`, `QB.vi.list`, `QB.latex`, `QB.maths.calc`, `equation`, `sequence`, `measure`, or another demonstrated helper.
    - Derive answers and displayed values from the same domain object. Never duplicate a helper's internal formula beside it. For a missing sequence term rendered from `seq`, use `seq.at(index)` (one-based), not `start + (index - 1) * step`; for calculations, equations, and measurements, use their `value`, `solve()`, or conversion APIs rather than recomputing them separately.
    - Enumerate numbers by digit length and constraints with `QB.maths.numbers({ length, digits, duplicate, odd, even, where })`. Express digit predicates with helpers such as `QB.maths.digits`, `sumDigits`, `sum`, or `product`; do not replace this API with nested digit loops.
    - Represent consecutive arithmetic progressions with `QB.maths.sequence(...)`. Use the resulting sequence for calculation and its `render(...)`/`toText(...)` methods for authored sequence output; do not rebuild the progression with manual loops, array ranges, or hard-coded term lists.
12. Write a meaningful worked explanation for every supported language, even when the static explanation is empty. The explanation must show the reasoning or calculation that produces the answer, not merely repeat the answer.
    - Build explanations from the same parameters and domain objects used by the question. Use `QB.fmt` for prose and reuse `calc`, `equation`, `system`, `sequence`, or `measure` results instead of duplicating arithmetic.
    - Prefer a teachable pattern, decomposition, place-value argument, counting formula, or grouping strategy over exhaustive listing. Enumerate every candidate only when there are at most 10 candidates and the list itself is pedagogically useful. When there are more than 10 candidates, the solution must not list all numbers, digits, cases, or occurrences as its primary reasoning or as an intermediate verification step; count them by structure instead (for example, split by place value, count complete groups, handle boundary cases, and combine the subtotals).
    - Keep English and Vietnamese explanations mathematically equivalent. Locale-specific prose may differ naturally, but intermediate values, operations, units, and conclusions must agree.
    - Do not introduce new random values or call random/name generators inside `explanationGeneratorTs`; explanations must describe the already-generated question.
13. Preserve `question_no`, source wording where compatible with the quiz's supported languages, response contract, choice semantics, units, and intentional constants.
14. Produce the persisted fields emitted by the current Tools save path, including source, compiled output, origin data, explanation source, and the current QuizBuilder API version.
15. Never set `verified: true`, publish content, or deploy.

### Choose helpers by responsibility

Use the narrowest existing helper that owns the mathematical or language concept. Read its live implementation and nearby records before using it; do not manually reproduce behavior already exposed by the helper.

- `QB.fmt`: compose each supported locale's question and worked explanation around already-rendered values. For multiline content, put the opening backtick, each content line, and the closing backtick on separate source lines. Indent content one normal code level beyond its property and align the closing backtick with the property; `QB.fmt` removes that source indentation from the rendered output. Never insert `\\n`, `${'\\n'}`, or another newline escape/interpolation. It does not own arithmetic, equation parsing, sequence indexing, unit conversion, or answer calculation.

  ```ts
  return {
    vi: QB.fmt`
      First line
      Second line
    `,
  }
  ```
- `QB.vi` / `QB.en`: generate and render locale-specific names, number words, ordinals, lists, colors, classifiers, and other language rules. Do not manually concatenate locale grammar when a locale helper exists.
- `QB.latex`: represent notation that requires structured mathematical typesetting. Keep raw source facts in parameters and build the rendered expression at the question boundary.
- `QB.maths.calc`: represent every authored arithmetic expression that the learner evaluates, including every intermediate operation introduced while explaining an equation. Create a separate calculation object for each displayed addition, subtraction, multiplication, or division; do not stop after wrapping only the first step. Interpolate the calculation object directly into `QB.fmt` to render the expression with its computed result; this is the default and must not be written as `${calculation.render()}`. Use `renderExpression()` only when the computed result must be omitted, and read the numeric answer from `.value`. Do not manually interpolate operands, operator glyphs, and results into prose when a calculation object can own and render that expression. For example, explain `x - a = b` with `const addition = QB.maths.calc\`${b} + ${a}\`` and `x = ${addition}`, not `x = ${b} + ${a} = ${equation.solve()}`.
- `QB.maths.equation`: represent equality with one or more unknowns. Interpolate the same equation object into the prompt and use `.solve()` for linear equations and supported reciprocal-linear forms such as `54 / y = 6` or `54 / (y + 1) = 6`. Reciprocal solving requires a constant numerator, one linear denominator, and a constant opposite side; general rational equations, variable-by-variable products, and nonlinear powers remain unsupported. Do not create a second equivalent equation or duplicate the algebra outside the object when `.solve()` supports the authored form.
- `QB.maths.system`: represent and solve a system of linear equations. Render and solve the same system object; supply known variable values through its supported API.
- `QB.maths.sequence`: represent arithmetic, bounded, indexed, or recurrence sequences. Use `render(...)` / `toText(...)` for display, one-based `.at(index)` for a requested term, `.toArray()` for aggregate calculations, and `.next()` only relative to a configured sequence count. Never restate the sequence formula outside the object.
- `QB.maths.measure`: represent quantities with units. Use its render, arithmetic, and conversion methods, and put the requested answer unit in answer metadata. Do not manually multiply by unit conversion factors.
- `QB.maths.numbers`, `number`, `digits`, `fromDigits`, `sumDigits`, `sum`, and `product`: use these for bounded enumeration and digit operations. Prefer their native constraints and predicates over loops or handwritten place-value logic.
- `QB.maths.comparisonSign(left, right)`: return the comparison sign `>`, `<`, or `=` for two numeric values. Use it when question or explanation text needs the sign; do not duplicate the ternary comparison. Use `QB.answer.choiceCompare(left, right)` when the sign is the learner's choice answer, since that helper delegates to the same comparison logic.
- `QB.linq`: filter, order, group, count, and aggregate an already-defined collection. It should operate on values produced by the relevant domain helper, not replace that helper.
- `QB.answer`: use `input`, `multiple`, `nested`, `choice`, `fixedChoice`, or `choiceCompare` to preserve the interaction contract. Derive the correct value first from the owning domain object, then pass it to the answer helper. Prefer helper defaults: call `choiceCompare(left, right)` for the standard `>`, `<`, `=` labels, and pass its third argument only when customizing those labels (for example, `X > Y`, `X < Y`, `X = Y`).

## Avoid false conventions

- Do not use a newly converted record as precedent for another record in the same conversion.
- Do not pass `answer`, `correct`, rendered expressions, or derived choices through parameters when they can be calculated from source facts.
- Do not copy legacy inconsistencies such as loose equality, redundant or unsupported language fields, unnecessary `let`, empty explanations, misspellings, or manual formatting when a current helper exists.
- Do not generalize from a single example when a closer structural match exists elsewhere in the topic.

## Validate before completing

For every converted record:

1. Parse it with the current content-v2 schema.
2. Compile its source through the same builder used by GetGo Tools.
3. Generate from its origin parameters and compare the localized question, choices, correct answer, and explanation with the original static record. Confirm every language in `quiz.json.supportedLanguages` has non-empty question and explanation content, and no unsupported locale is emitted by the generators.
4. Generate at least 30 randomized samples. Assert that each sample renders, has a valid answer, obeys all arithmetic and range constraints, and has non-empty, mathematically consistent question and worked-explanation content in every supported language.
5. Run the relevant repository typecheck or targeted test when implementation code changed. Do not run a build unless the user explicitly requested that build.
6. If the runtime boundary changed, follow the repository restart rules and confirm startup. Data-only question changes do not require an application restart unless the active runtime caches those records.

## Preserve review boundaries

- Treat generated content as a proposal for administrator review.
- Do not silently correct an apparent source-content mistake. If correction is necessary for a mathematically valid dynamic template, make the smallest correction and report it explicitly.
- Do not alter neighboring quizzes merely to standardize style.
