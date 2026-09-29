# Repository code map

Read these files directly at task time; their current implementation overrides this summary.

## Storage and editor path

- `tnp-getgo-tools/src/features/topics/domain/content-v2.ts` — persisted content-v2 shapes and parsing.
- `tnp-getgo-tools/src/features/topics/pages/ContentV2QuizManager.tsx` — editor-to-record conversion and save behavior; inspect `fromManagerQuestion` and its callers.
- `tnp-getgo-tools/src/features/quiz-editor/components/question-service.ts` — question compilation and generation used by the editor.
- `tnp-getgo-logics/src/authoring/dynamic-question-build-service.ts` — source build behavior and compiled artifacts.

## QuizBuilder runtime

- `tnp-getgo-logics/src/quiz-builder/QuizBuilder.ts` — public builder surface.
- `tnp-getgo-logics/src/quiz-builder/` — implementations of `QB.rnd`, `QB.maths`, `QB.answer`, `QB.en`, `QB.vi`, LaTeX, and rendering helpers. Follow the implementation of every helper used by a proposed template.

## Real question references

Start with established dynamic records in the target topic, preferring the same concept and answer interaction:

- `tnp-getgo-quizzes/content-v2/topics/archimedes-maths-3e2/quizzes/pot-2-2/questions/`
- `tnp-getgo-quizzes/content-v2/topics/archimedes-maths-3e2/quizzes/pot-4-1/questions/`
- `tnp-getgo-quizzes/content-v2/topics/archimedes-maths-3e2/quizzes/pot-3-2/questions/`
- `tnp-getgo-quizzes/content-v2/topics/archimedes-maths-3e2/quizzes/pot-3-1/questions/`
- `tnp-getgo-quizzes/content-v2/topics/archimedes-maths-3e2/quizzes/pot-t9-1/questions/`

Do not use records produced during the current conversion as references for that conversion. Match the mathematical structure against previously established nearby questions, then verify every helper and persisted field against the current implementation paths above.

## Canonical Archimedes examples

Read only the examples relevant to the current question:

- Named story roles and matching plain origin keys: `pot-t9-1/questions/q7.json`.
- Single generated name with plain-string origin: `pot-3-2/questions/q5.json`.
- A mathematical array destructured inside the question generator: `pot-t9-1/questions/q2.json`.
- Multiple grouped expressions with nested inputs: `pot-t9-1/questions/q16.json`.
- Constructively generated equations and `solve()`: `pot-t9-1/questions/q17.json`.
- Array-based arithmetic expressions and `renderExpression()`: `pot-t9-1/questions/q19.json`.
- Runtime sequence values requiring an origin callback: `pot-t9-1/questions/q3.json`.
- Bounded consecutive sequences used for digit counting: `pot-3-2/questions/q8.json`, `q10.json`, and `q11.json`.
- Measurements requiring an origin callback and unit conversion: `pot-t9-1/questions/q4.json`.
- Multiple accepted values: `pot-2-2/questions/q10.json`.
- Multiple labeled inputs: `pot-2-2/questions/q11.json`.
- Mixed nested scalar and multiple-answer inputs: inspect `QuizBuilder.answer.nested`, the multiple-input editor, publisher, and runtime renderer together.
- Comparison choices with custom labels: `pot-t9-1/questions/q9.json`.
- Digit permutations and filtering with `QB.maths` plus `QB.linq`: `pot-3-1/questions/q1.json` and `pot-3-2/questions/q2.json`.
- Number enumeration with native `where` constraints: `pot-3-1/questions/q12.json` and `pot-3-2/questions/q3.json`/`q4.json`.
- Constructive dependent values rather than retry loops: `pot-t9-1/questions/q17.json` and `pot-t9-1/questions/q19.json`.
- Worked Vietnamese explanations using `QB.fmt` and `QB.maths.calc`: `pot-2-2/questions/q7.json` and `pot-2-2/questions/q12.json`.

## Boundaries derived from those examples

- Generated and origin parameters contain source facts. The question generator calculates `correct` and constructs `QB.answer`.
- Incidental story names come from the applicable locale helper. Derived text such as an uppercase Latin prefix stays out of parameters and is calculated with `QB.vi.toLatin(name).toUpperCase()` where used.
- Origin keys and types mirror generated keys and types. Use an object literal unless domain objects must be reconstructed.
- Individually referenced people are named roles; mathematical collections remain arrays.
- `quiz.json.supportedLanguages` controls localization. Emit non-empty question and worked-explanation content for every declared locale and omit unsupported locale fields. Translate a missing supported variant faithfully; do not copy legacy empty placeholders.
- Semicolon-separated digit sets commonly use `join('; ')`; natural-language lists use `QB.vi.list`.
- `QB.fmt` handles authored multiline text and interpolation of renderable values. For multiline content, place the opening backtick, literal content lines, and closing backtick on separate source lines; indent content one normal code level beyond the property and align the closing backtick with the property. `QB.fmt` removes this source indentation from rendered output. Never use `\\n`, `${'\\n'}`, or another newline escape/interpolation.
- Every converted question has a meaningful worked explanation in each supported language. The explanation reuses the question's parameters and mathematical domain objects, shows how the result is obtained, and never generates fresh random values.
- Prefer concise, reusable reasoning—such as place value, grouping, decomposition, or a number pattern—over asking the learner to exhaustively list a large candidate set.
- For bilingual quizzes, English and Vietnamese question/explanation pairs must use the same mathematical structure, intermediate values, answer, and units even when their natural-language phrasing differs.
- Use one domain object as the source of truth for rendering and answers. If a sequence is rendered from `seq`, read a requested term with one-based `seq.at(index)`; do not duplicate its arithmetic formula from `start` and `step`. Likewise, use calculation values, equation solvers, and measurement conversions from the object that renders the prompt.
- Build every displayed arithmetic expression, including every intermediate operation introduced by a worked equation explanation, with `QB.maths.calc`. Audit the complete explanation, not just its first calculation: a chain containing addition, subtraction, and division needs calculation objects for all three displayed operations. Interpolate each calculation object directly into `QB.fmt` for its default expression-and-result rendering; do not call `.render()` there. Use `renderExpression()` only when the computed result must be omitted.
- `Equation.solve()` supports linear equations and reciprocal-linear forms with a constant numerator, one linear denominator, and a constant opposite side, such as `54 / y = 6`. Render and solve the same equation object. General rational equations, variable-by-variable products, and nonlinear powers remain unsupported; do not duplicate supported algebra in a second equation or standalone arithmetic.
- Use `QB.maths.numbers` and its constraint options for bounded digit enumeration; use `where` with digit helpers instead of nested loops.
- Treat an arithmetic progression as a `QB.maths.sequence`: calculate from `toArray()` and render from the same sequence with `render(...)` or `toText(...)` so its start, step, end, and displayed terms cannot drift apart.
- Use the answer helper corresponding to the stored response contract. Units belong in answer metadata, not the correct value.
- `QB.answer.choiceCompare(left, right)` already supplies fixed `>`, `<`, `=` choices in that order. Omit the labels argument for standard comparisons; provide it only for customized labels such as `X > Y`, `X < Y`, `X = Y`.
- `QB.maths.comparisonSign(left, right)` is the source of truth when rendered question or explanation text needs `>`, `<`, or `=`. Do not restate its ternary logic; `QB.answer.choiceCompare` delegates to it for comparison-choice answers.
- Preserve arrays for multi-value nested parts. Do not serialize several accepted values into comma-separated text.
- Treat empty explanations, loose equality, unsupported or empty localized fields, typos, and older manual implementations as legacy observations rather than standards.
