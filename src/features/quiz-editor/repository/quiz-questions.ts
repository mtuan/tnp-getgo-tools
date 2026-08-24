import { promises as fs } from "node:fs";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import path from "node:path";
import {
  QuizTsService,
  createDynamicQuestionBuildService,
} from "@tnp/getgo-logics/authoring";
import {
  QuizBuilder,
  QuizValueSerializer,
} from "@tnp/getgo-logics/quiz-builder";
import type { AlphabetLetterResource, QuizQuestionRecord } from "../../../shared/domain/models.js";
import { questionIsVerified, withQuestionStatus } from "../../../features/quiz-editor/domain/question-status.js";
import { DEFAULT_EXPLANATION_GENERATOR_TS, formatQuestionCode } from "../../../features/quiz-editor/domain/question-dynamics.js";

const inlineImagePattern =
  /^data:image\/([a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i;
const builder = createDynamicQuestionBuildService({
  createBuilder: () => new QuizBuilder(),
  serialize: <T>(value: T): T => QuizValueSerializer.serialize(value),
  deserialize: <T>(value: T): T => QuizValueSerializer.deserialize(value),
  hash: async (source: string) =>
    createHash("sha256").update(source).digest("hex"),
});

function sourceLiteral(value: unknown): string {
  return JSON.stringify(value, null, 2).replace(
    /^(\s*)"([A-Za-z_$][\w$]*)":/gm,
    "$1$2:",
  );
}

function indent(source: string, spaces: number): string {
  const prefix = " ".repeat(spaces);
  return source.split("\n").map((line) => `${prefix}${line}`).join("\n");
}

function answerExpression(value: unknown): string {
  const answer = value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
  const choices = answer.choices && typeof answer.choices === "object"
    ? answer.choices as Record<string, unknown>
    : null;
  if (choices && Object.keys(choices).length)
    return `QB.answer.choice(${sourceLiteral(answer.correct)}, ${sourceLiteral(choices)})`;
  const inputType = ["text", "number", "date"].includes(String(answer.inputType))
    ? String(answer.inputType)
    : undefined;
  const options = {
    ...(answer.unit ? { unit: answer.unit } : {}),
    ...(inputType ? { inputType } : {}),
  };
  const optionsArgument = Object.keys(options).length ? `, ${sourceLiteral(options)}` : "";
  return `QB.answer.input(${sourceLiteral(answer.correct ?? "")}${optionsArgument})`;
}

function questionGeneratorSource(question: Record<string, unknown>): string {
  const fields = Object.fromEntries(Object.entries(question).filter(([key]) => ![
    "answer", "action", "status", "verified", "schemaVersion",
    "authoringMode", "advancedDynamic", "reference", "generatorBuild",
  ].includes(key)));
  const fieldSource = sourceLiteral(fields).slice(1, -1).trim();
  return `({}) => {\n  return {\n${fieldSource ? `${indent(fieldSource, 4)},\n` : ""}    answer: ${answerExpression(question.answer)},\n  }\n}`;
}

function dynamicStarterFields(question: Record<string, unknown>) {
  const starterQuestion = {
    ...question,
    text_en: Array.isArray(question.text_en)
      ? question.text_en.join("\n")
      : String(question.text_en ?? ""),
    ...(question.text_vn !== undefined
      ? {
          text_vn: Array.isArray(question.text_vn)
            ? question.text_vn.join("\n")
            : String(question.text_vn),
        }
      : {}),
  };
  const fields = QuizTsService.extractTemplateSourceFields(
    builder.createStarterSource(starterQuestion as never),
  );
  return {
    paramsGeneratorTs: fields.paramsGeneratorTs,
    questionGeneratorTs: fields.questionGeneratorTs,
    originParamsTs: fields.originParamsTs ?? "{}",
    explanationGeneratorTs:
      fields.explanationGeneratorTs ?? DEFAULT_EXPLANATION_GENERATOR_TS,
  };
}

function imageExtension(subtype: string): string {
  if (subtype.toLowerCase() === "jpeg") return "jpg";
  if (subtype.toLowerCase() === "svg+xml") return "svg";
  return subtype.toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
}

async function extractImages(
  question: Record<string, unknown>,
  index: number,
  assetsDirectory: string,
): Promise<Record<string, unknown>> {
  const questionNo = String(question.question_no ?? index + 1).replace(
    /[^a-z0-9_-]/gi,
    "-",
  );
  const stem = `question-${questionNo}`;
  const processValue = async (
    value: unknown,
    name: string,
  ): Promise<unknown> => {
    if (typeof value !== "string") return value;
    const match = value.match(inlineImagePattern);
    if (!match) return value;
    const fileName = `${name}.${imageExtension(match[1])}`;
    await fs.mkdir(assetsDirectory, { recursive: true });
    await fs.writeFile(
      path.join(assetsDirectory, fileName),
      Buffer.from(match[2].replace(/\s/g, ""), "base64"),
    );
    return `asset:${fileName}`;
  };
  const imageDatas = Array.isArray(question.image_datas)
    ? await Promise.all(
        question.image_datas.map((value: unknown, imageIndex: number) =>
          processValue(value, imageIndex ? `${stem}-${imageIndex + 1}` : stem),
        ),
      )
    : question.image_datas;
  const answer =
    question.answer && typeof question.answer === "object"
      ? (question.answer as Record<string, unknown>)
      : undefined;
  const choices =
    answer?.choices && typeof answer.choices === "object"
      ? (answer.choices as Record<string, unknown>)
      : undefined;
  const nextChoices = choices
    ? Object.fromEntries(
        await Promise.all(
          Object.entries(choices).map(
            async ([label, value]: [string, unknown]) => [
              label,
              await processValue(value, `${stem}-${label}`),
            ],
          ),
        ),
      )
    : undefined;
  return {
    ...question,
    ...(imageDatas !== undefined ? { image_datas: imageDatas } : {}),
    ...(answer
      ? {
          answer: {
            ...answer,
            ...(nextChoices ? { choices: nextChoices } : {}),
          },
        }
      : {}),
  };
}

function normalizeQuestion(
  question: Record<string, unknown>,
  index: number,
): QuizQuestionRecord {
  if (question.type === "alphabet") {
    const legacy =
      question.alphabet &&
      typeof question.alphabet === "object" &&
      !Array.isArray(question.alphabet)
        ? (question.alphabet as Record<string, unknown>)
        : {};
    const value = (key: string): unknown => question[key] ?? legacy[key];
    return {
      question_no:
        (question.question_no as number | string | undefined) ?? index + 1,
      type: "alphabet",
      letter:
        typeof value("letter") === "string" ? (value("letter") as string) : "",
      uppercase:
        typeof value("uppercase") === "string"
          ? (value("uppercase") as string)
          : "",
      lowercase:
        typeof value("lowercase") === "string"
          ? (value("lowercase") as string)
          : "",
      ...(typeof value("pronunciation") === "string"
        ? { pronunciation: value("pronunciation") as string }
        : {}),
      resources: Array.isArray(value("resources"))
        ? (value("resources") as AlphabetLetterResource[])
        : [],
      ...(typeof question.status === "string"
        ? { status: question.status }
        : {}),
      ...(typeof question.verified === "boolean"
        ? { verified: question.verified }
        : {}),
      ...(question.feedback && typeof question.feedback === "object"
        ? { feedback: question.feedback as never }
        : {}),
    };
  }
  const normalized: Record<string, unknown> & { question_no: number | string } =
    {
      ...question,
      question_no:
        (question.question_no as number | string | undefined) ?? index + 1,
    };
  if (
    normalized.authoringMode === "advanced-dynamic" &&
    normalized.advancedDynamic
  )
    return normalized as QuizQuestionRecord;
  if (
    normalized.authoringMode === "reference" &&
    normalized.reference &&
    typeof normalized.reference === "object"
  )
    return normalized as QuizQuestionRecord;
  return {
    ...normalized,
    schemaVersion: Number(normalized.schemaVersion) || 1,
    ...(typeof normalized.verified === "boolean"
      ? { verified: normalized.verified }
      : {}),
    authoringMode: "advanced-dynamic",
    advancedDynamic: {
      paramsGeneratorTs: "() => {\n  return {}\n}",
      questionGeneratorTs: questionGeneratorSource(normalized),
      originParamsTs: "{}",
      explanationGeneratorTs: DEFAULT_EXPLANATION_GENERATOR_TS,
    },
  };
}

function questionNumber(fileName: string): number {
  return Number(
    fileName.match(/^q(\d+)\.json$/i)?.[1] ?? Number.MAX_SAFE_INTEGER,
  );
}

async function questionStorageVersion(manifestPath: string): Promise<unknown> {
  try {
    return (
      JSON.parse(await fs.readFile(manifestPath, "utf8")) as Record<
        string,
        unknown
      >
    ).questionStorageVersion;
  } catch {
    return undefined;
  }
}

async function markQuestionsStorage(manifestPath: string): Promise<void> {
  const manifest = JSON.parse(
    await fs.readFile(manifestPath, "utf8"),
  ) as Record<string, unknown>;
  if (manifest.questionStorageVersion === "questions-v1") return;
  manifest.questionStorageVersion = "questions-v1";
  await fs.writeFile(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
}

/** Legacy quizzes sometimes stored the original parameters as `() => ({ ... })`
 * or `() => { return { ... } }`. The current editor stores that field as the
 * independently editable object expression itself. Normalize before formatting;
 * otherwise object-expression formatting strips the callback's opening `(` and
 * leaves invalid source beginning with `) =>`.
 */
export function normalizeLegacyOriginParamsSource(
  source: string | undefined,
): string {
  const trimmed = source?.trim() || "{}";
  const arrow = trimmed.match(/^\(\s*\)\s*(?::[^=]+)?=>\s*([\s\S]+)$/);
  if (!arrow) return trimmed;
  let body = arrow[1].trim();
  if (body.startsWith("(") && body.endsWith(")"))
    body = body.slice(1, -1).trim();
  else {
    const returned = body.match(/^\{\s*return\s+([\s\S]*?);?\s*\}$/);
    if (returned) body = returned[1].trim().replace(/;$/, "").trim();
  }
  return body.startsWith("{") && body.endsWith("}") ? body : trimmed;
}

async function questionsFromRawTs(
  quizDirectory: string,
): Promise<QuizQuestionRecord[] | null> {
  const rawTsPath = path.join(quizDirectory, "raw.ts");
  const source = await fs
    .readFile(rawTsPath, "utf8")
    .catch((cause: unknown) => {
      if (
        cause &&
        typeof cause === "object" &&
        "code" in cause &&
        cause.code === "ENOENT"
      )
        return null;
      throw cause;
    });
  if (source === null) return null;
  const snippets = QuizTsService.extractSnippets(source);
  const rawJson = await fs
    .readFile(path.join(quizDirectory, "raw.json"), "utf8")
    .then(
      (value: string) =>
        JSON.parse(value) as Record<string, unknown> | unknown[],
    )
    .catch(() => null);
  const rawQuestions = Array.isArray(rawJson)
    ? rawJson
    : rawJson && Array.isArray(rawJson.questions)
      ? rawJson.questions
      : [];
  const records: QuizQuestionRecord[] = [];
  for (let index = 0; index < snippets.length; index += 1) {
    const snippet = snippets[index];
    let fields;
    try {
      fields = QuizTsService.extractTemplateSourceFields(snippet);
    } catch {
      fields = {
        paramsGeneratorTs: "() => ({})",
        questionGeneratorTs: `({}) => (${snippet})`,
        originParamsTs: "{}",
      };
    }
    const advancedDynamic = {
      paramsGeneratorTs: fields.paramsGeneratorTs,
      questionGeneratorTs: fields.questionGeneratorTs,
      originParamsTs: normalizeLegacyOriginParamsSource(fields.originParamsTs),
      explanationGeneratorTs: fields.explanationGeneratorTs?.trim()
        ? fields.explanationGeneratorTs
        : DEFAULT_EXPLANATION_GENERATOR_TS,
    };
    const templateSource = QuizTsService.composeTemplateSource(advancedDynamic);
    let sourceQuestion: Record<string, unknown> | null = null;
    let migrationError: QuizQuestionRecord["migrationError"];
    try {
      const generated = await builder.generateOriginal(templateSource);
      sourceQuestion = generated?.question as unknown as Record<
        string,
        unknown
      > | null;
    } catch (cause) {
      migrationError = {
        stage: "origin-render",
        message: cause instanceof Error ? cause.message : String(cause),
      };
    }
    if (!sourceQuestion) {
      const matchingRaw =
        rawQuestions.find(
          (value: unknown) =>
            value &&
            typeof value === "object" &&
            String((value as Record<string, unknown>).question_no ?? "") ===
              String(index + 1),
        ) ?? rawQuestions[index];
      if (matchingRaw && typeof matchingRaw === "object")
        sourceQuestion = matchingRaw as Record<string, unknown>;
    }
    if (!sourceQuestion) {
      const generated = await builder.generate(templateSource);
      sourceQuestion = generated.question as unknown as Record<string, unknown>;
    }
    const withAssets = await extractImages(
      sourceQuestion,
      index,
      path.join(quizDirectory, "assets"),
    );
    records.push(
      await formatQuestionCode({
        ...withAssets,
        schemaVersion: 1,
        authoringMode: "advanced-dynamic",
        advancedDynamic,
        ...(migrationError ? { migrationError } : {}),
      } as unknown as QuizQuestionRecord),
    );
  }
  return records;
}

async function questionsFromRawJson(
  quizDirectory: string,
): Promise<QuizQuestionRecord[]> {
  const raw = JSON.parse(
    await fs.readFile(path.join(quizDirectory, "raw.json"), "utf8"),
  ) as Record<string, unknown> | unknown[];
  const rawQuestions = Array.isArray(raw)
    ? raw
    : Array.isArray(raw.questions)
      ? raw.questions
      : [];
  const records: QuizQuestionRecord[] = [];
  for (let index = 0; index < rawQuestions.length; index += 1) {
    const value = rawQuestions[index];
    if (!value || typeof value !== "object") continue;
    const withAssets = await extractImages(
      value as Record<string, unknown>,
      index,
      path.join(quizDirectory, "assets"),
    );
    records.push(
      await formatQuestionCode(normalizeQuestion(withAssets, index)),
    );
  }
  return records;
}

async function defaultQuestions(
  quizDirectory: string,
): Promise<QuizQuestionRecord[]> {
  const fromTypeScript = await questionsFromRawTs(quizDirectory);
  if (fromTypeScript) return fromTypeScript;
  try {
    return await questionsFromRawJson(quizDirectory);
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException)?.code === "ENOENT") return [];
    throw cause;
  }
}

export async function loadQuizQuestions(
  manifestPath: string,
): Promise<QuizQuestionRecord[]> {
  const quizDirectory = path.dirname(manifestPath);
  const questionsDirectory = path.join(quizDirectory, "questions");
  const existing = await fs
    .readdir(questionsDirectory)
    .catch(() => [] as string[]);
  const files = existing.filter((name: string) => /^q\d+\.json$/i.test(name));
  if (files.length) {
    await markQuestionsStorage(manifestPath);
    const records = await Promise.all(
      files.map(async (file: string) => {
        const record = normalizeQuestion(
          JSON.parse(
            await fs.readFile(path.join(questionsDirectory, file), "utf8"),
          ) as Record<string, unknown>,
          Math.max(0, questionNumber(file) - 1),
        );
        if (!record.advancedDynamic) return record;
        try {
          return await formatQuestionCode(record);
        } catch {
          return record;
        }
      }),
    );
    return records.sort(
      (left, right) => Number(left.question_no) - Number(right.question_no),
    );
  }
  if ((await questionStorageVersion(manifestPath)) === "questions-v1")
    return [];

  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as {
    source?: { format?: unknown };
  };
  if (manifest.source?.format === "manual-v1") {
    await fs.mkdir(questionsDirectory, { recursive: true });
    await markQuestionsStorage(manifestPath);
    return [];
  }

  await fs.mkdir(questionsDirectory, { recursive: true });
  const records = await defaultQuestions(quizDirectory);
  for (const record of records) {
    await fs.writeFile(
      path.join(questionsDirectory, `q${record.question_no}.json`),
      `${JSON.stringify(record, null, 2)}\n`,
      "utf8",
    );
  }
  await markQuestionsStorage(manifestPath);
  return records;
}

export async function saveQuizQuestion(
  manifestPath: string,
  question: QuizQuestionRecord,
): Promise<QuizQuestionRecord> {
  const questionNo = String(question.question_no);
  if (!/^\d+$/.test(questionNo)) throw new Error("Invalid question number");
  const questionsDirectory = path.join(path.dirname(manifestPath), "questions");
  await fs.mkdir(questionsDirectory, { recursive: true });
  const existing = await storedQuestionFiles(manifestPath);
  const target =
    existing.find((item) => String(item.record.question_no) === questionNo)
      ?.file ??
    `q${existing.length ? Math.max(...existing.map((item) => questionNumber(item.file))) + 1 : 1}.json`;
  const answer = question.answer && typeof question.answer === "object" && !Array.isArray(question.answer)
    ? question.answer as Record<string, unknown>
    : null;
  const choices = answer?.choices && typeof answer.choices === "object" && !Array.isArray(answer.choices)
    ? answer.choices as Record<string, unknown>
    : null;
  const populatedChoices = choices
    ? Object.fromEntries(Object.entries(choices).filter(([, value]) =>
        typeof value === "string" ? value.trim() !== "" : value !== null && value !== undefined))
    : null;
  const questionWithoutEmptyChoices = choices && answer
    ? {
        ...question,
        answer: {
          ...answer,
          choices: populatedChoices,
          ...(typeof answer.otherChoiceKey === "string" && populatedChoices && answer.otherChoiceKey in populatedChoices
            ? { otherChoiceKey: answer.otherChoiceKey }
            : { otherChoiceKey: undefined }),
        },
      } as QuizQuestionRecord
    : question;
  const normalized = normalizeQuestion(
    questionWithoutEmptyChoices,
    Math.max(0, Number(questionNo) - 1),
  );
  const formatted = await formatQuestionCode(normalized);
  await fs.writeFile(
    path.join(questionsDirectory, target),
    `${JSON.stringify(formatted, null, 2)}\n`,
    "utf8",
  );
  return formatted;
}

export async function markAllQuizQuestionsReviewed(
  manifestPath: string,
): Promise<QuizQuestionRecord[]> {
  const questionsDirectory = path.join(path.dirname(manifestPath), "questions");
  const existing = await storedQuestionFiles(manifestPath);
  const reviewed = existing.map(({ file, record }) => ({
    file,
    record: questionIsVerified(record)
      ? record
      : withQuestionStatus(record, "verified"),
  }));

  await Promise.all(
    reviewed.map(async ({ file, record }, index) => {
      if (questionIsVerified(existing[index].record)) return;
      await fs.writeFile(
        path.join(questionsDirectory, file),
        `${JSON.stringify(record, null, 2)}\n`,
        "utf8",
      );
    }),
  );

  return reviewed.map(({ record }) => record);
}

async function storedQuestionFiles(
  manifestPath: string,
): Promise<Array<{ file: string; record: QuizQuestionRecord }>> {
  const questionsDirectory = path.join(path.dirname(manifestPath), "questions");
  const entries = await fs
    .readdir(questionsDirectory)
    .catch(() => [] as string[]);
  const files = entries
    .filter((file) => /^q\d+\.json$/i.test(file))
    .sort((left, right) => questionNumber(left) - questionNumber(right));
  return Promise.all(
    files.map(async (file) => ({
      file,
      record: normalizeQuestion(
        JSON.parse(
          await fs.readFile(path.join(questionsDirectory, file), "utf8"),
        ) as Record<string, unknown>,
        Math.max(0, questionNumber(file) - 1),
      ),
    })),
  );
}

export async function quizQuestionFile(
  manifestPath: string,
  questionNo: string,
): Promise<string> {
  const item = (await storedQuestionFiles(manifestPath)).find(
    (candidate) => String(candidate.record.question_no) === questionNo,
  );
  if (!item) throw new Error(`Question ${questionNo} was not found`);
  return path.join(path.dirname(manifestPath), "questions", item.file);
}

function renumberQuestion(
  record: QuizQuestionRecord,
  questionNo: number,
): QuizQuestionRecord {
  if (!record.advancedDynamic) return { ...record, question_no: questionNo };
  const questionGeneratorTs =
    record.advancedDynamic.questionGeneratorTs.replace(
      /(\bquestion_no\s*:\s*)\d+(?=\s*[,}])/,
      `$1${questionNo}`,
    );
  const { draftSourceTs: _draftSourceTs, ...advancedDynamic } =
    record.advancedDynamic;
  return {
    ...record,
    question_no: questionNo,
    advancedDynamic: { ...advancedDynamic, questionGeneratorTs },
  };
}

async function replaceStoredQuestionOrder(
  manifestPath: string,
  ordered: Array<{ file: string; record: QuizQuestionRecord }>,
): Promise<QuizQuestionRecord[]> {
  const questionsDirectory = path.join(path.dirname(manifestPath), "questions");
  await fs.mkdir(questionsDirectory, { recursive: true });
  await markQuestionsStorage(manifestPath);
  const token = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const staged = await Promise.all(
    ordered.map(async (item, index) => {
      const record = renumberQuestion(item.record, index + 1);
      const stagedFile = `.getgo-reorder-${token}-${item.file}`;
      await fs.writeFile(
        path.join(questionsDirectory, stagedFile),
        `${JSON.stringify(record, null, 2)}\n`,
        "utf8",
      );
      return { file: item.file, stagedFile, record };
    }),
  );
  try {
    for (const item of staged)
      await fs.rename(
        path.join(questionsDirectory, item.stagedFile),
        path.join(questionsDirectory, item.file),
      );
    return staged.map((item) => item.record);
  } catch (cause) {
    await Promise.all(
      staged.map((item) =>
        fs
          .unlink(path.join(questionsDirectory, item.stagedFile))
          .catch(() => undefined),
      ),
    );
    throw cause;
  }
}

export async function createQuizQuestion(
  manifestPath: string,
): Promise<QuizQuestionRecord> {
  const existing = await storedQuestionFiles(manifestPath);
  const questionNo = existing.length
    ? Math.max(
        ...existing.map((item) => Number(item.record.question_no) || 0),
      ) + 1
    : 1;
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as {
    type?: unknown;
  };
  const alphabet = manifest.type === "alphabet";
  const created = await saveQuizQuestion(
    manifestPath,
    normalizeQuestion(
      alphabet
        ? {
            question_no: questionNo,
            type: "alphabet",
            letter: "",
            uppercase: "",
            lowercase: "",
            pronunciation: "",
            resources: [],
          }
        : {
            question_no: questionNo,
            category: "",
            text_en: "",
            text_vn: "",
            answer: { type: "input", correct: "" },
          },
      questionNo - 1,
    ),
  );
  await markQuestionsStorage(manifestPath);
  return created;
}

export async function reorderQuizQuestions(
  manifestPath: string,
  questionNumbers: string[],
): Promise<QuizQuestionRecord[]> {
  const existing = await storedQuestionFiles(manifestPath);
  const byNumber = new Map(
    existing.map((item) => [String(item.record.question_no), item]),
  );
  if (
    questionNumbers.length !== existing.length ||
    new Set(questionNumbers).size !== existing.length ||
    questionNumbers.some((number) => !byNumber.has(number))
  ) {
    throw new Error(
      "Question order must contain every stored question exactly once",
    );
  }
  return replaceStoredQuestionOrder(
    manifestPath,
    questionNumbers.map((number) => byNumber.get(number)!),
  );
}

export async function deleteQuizQuestion(
  manifestPath: string,
  questionNo: string,
): Promise<QuizQuestionRecord[]> {
  const existing = await storedQuestionFiles(manifestPath);
  const target = existing.find(
    (item) => String(item.record.question_no) === questionNo,
  );
  if (!target) throw new Error(`Question ${questionNo} was not found`);
  await fs.unlink(
    path.join(path.dirname(manifestPath), "questions", target.file),
  );
  return replaceStoredQuestionOrder(
    manifestPath,
    existing
      .filter((item) => item.file !== target.file)
      .sort(
        (left, right) =>
          Number(left.record.question_no) - Number(right.record.question_no),
      ),
  );
}

export async function resetQuizQuestion(
  manifestPath: string,
  question: QuizQuestionRecord,
): Promise<QuizQuestionRecord> {
  const defaults = await defaultQuestions(path.dirname(manifestPath));
  const sourceDefault = defaults.find(
    (item: QuizQuestionRecord) =>
      String(item.question_no) === String(question.question_no),
  );
  const {
    advancedDynamic: _advancedDynamic,
    aiResponse: _aiResponse,
    aiFixHistory: _aiFixHistory,
    generatorBuild: _generatorBuild,
    ...sourceQuestion
  } = question;
  const resetSource = sourceDefault ?? sourceQuestion;
  const {
    advancedDynamic: _resetDynamic,
    aiResponse: _resetAiResponse,
    aiFixHistory: _resetAiFixHistory,
    generatorBuild: _resetGeneratorBuild,
    ...resetStatic
  } = resetSource;
  const normalizedStatic = normalizeQuestion(
    {
      ...resetStatic,
      authoringMode: undefined,
      status: undefined,
      verified: undefined,
    },
    Math.max(0, Number(question.question_no) - 1),
  );
  const reset: QuizQuestionRecord = {
    ...normalizedStatic,
    authoringMode: "advanced-dynamic" as const,
    advancedDynamic: dynamicStarterFields(resetStatic),
  } as QuizQuestionRecord;
  return saveQuizQuestion(manifestPath, reset);
}
