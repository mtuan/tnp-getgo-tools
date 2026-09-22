import {
  QuizTsService,
  createDynamicQuestionBuildService,
} from "@tnp/getgo-logics/authoring";
import {
  QuizBuilder,
  QuizValueSerializer,
} from "@tnp/getgo-logics/quiz-builder";
import { staticAnswerType } from "../../../features/quiz-editor/domain/answer-types";
import { DEFAULT_EXPLANATION_GENERATOR_TS } from "../../../features/quiz-editor/domain/question-dynamics";
import type { ContestQuizQuestionRecord } from "../../../shared/domain/models";
import { dynamicGenerationWorkerClient } from "./dynamic-generation-worker-client";

export interface RuntimeQuestion extends Record<string, unknown> {
  question_no: number;
  category?: string;
  text_en: unknown;
  text_vn?: unknown;
  image_datas?: string[];
  explanation?: { en?: unknown; vi?: unknown };
  answer: {
    type: string;
    correct: string | number | string[];
    inputType?: "text" | "number" | "date";
    choices?: Record<string, unknown>;
    inputs?: Array<{
      question_en: string;
      question_vn?: string;
      inputType?: "text" | "number" | "date";
      unit?: string;
    }>;
    unit?: string;
    otherChoiceKey?: string;
    fixed?: boolean;
    format?: unknown;
  };
}

export interface GeneratedQuestion {
  question: RuntimeQuestion;
  params?: Record<string, unknown>;
}

const digitPlaces = [
  "ones", "tens", "hundreds", "thousands", "ten-thousands",
  "hundred-thousands", "millions", "ten-millions", "hundred-millions",
  "billions", "ten-billions", "hundred-billions", "trillions",
] as const;

function replaceDigitArray(
  value: readonly number[],
  placeOrReplacements: unknown,
  replacement?: unknown,
): string {
  if (value.length === 0 || value.some(digit => !Number.isInteger(digit) || digit < 0 || digit > 9))
    throw new TypeError("QB.maths.replaceDigit expects a non-empty iterable of integer digits from 0 to 9");
  const entries = placeOrReplacements && typeof placeOrReplacements === "object"
    ? Object.entries(placeOrReplacements as Record<string, unknown>)
    : [[replacement, placeOrReplacements]];
  const positions = new Set<number>();
  const replacements = entries.map(([character, place]) => {
    if (typeof character !== "string" || Array.from(character).length !== 1)
      throw new TypeError("QB.maths.replaceDigit replacement must be exactly one character");
    const position = typeof place === "number" ? place : digitPlaces.indexOf(place as typeof digitPlaces[number]);
    if (!Number.isInteger(position) || position < 0)
      throw new TypeError("QB.maths.replaceDigit position must be a non-negative integer");
    if (positions.has(position))
      throw new TypeError("QB.maths.replaceDigit replacement positions must be unique");
    positions.add(position);
    return { character, position };
  });
  const digits = value.map(String);
  const width = Math.max(digits.length, ...replacements.map(item => item.position + 1));
  const result = digits.join("").padStart(width, "0").split("");
  for (const { character, position } of replacements)
    result[result.length - 1 - position] = character;
  return result.join("");
}

type AuthoringDigitNumbersOptions = {
  length: number;
  odd?: boolean;
  even?: boolean;
  digits?: readonly number[];
  duplicate?: boolean;
  where?: (value: number) => boolean;
};

type AuthoringNumberRangeOptions = {
  start: number;
  end: number;
  step?: number;
  where?: (value: number) => boolean;
};

type AuthoringNumbersOptions = AuthoringDigitNumbersOptions | AuthoringNumberRangeOptions;

function createAuthoringQuizBuilder(): QuizBuilder {
  const builder = new QuizBuilder();
  const random = builder.rnd as unknown as {
    int(min: number, max: number, options?: { step?: number; odd?: boolean; even?: boolean }): number;
  };
  const randomInt = random.int.bind(random);
  random.int = (min, max, options = {}) => {
    if (options.odd === true && options.even === true)
      throw new RangeError("Random integer cannot require both odd and even values");
    const requiredParity = options.odd === true ? 1 : options.even === true ? 0 : undefined;
    if (requiredParity === undefined) return randomInt(min, max, options);
    const step = options.step ?? 1;
    if (!Number.isInteger(step) || step <= 0)
      return randomInt(min, max, options);
    const stepCount = Math.floor((max - min) / step);
    const minParity = Math.abs(min % 2);
    if (step % 2 === 0) {
      if (minParity !== requiredParity)
        throw new RangeError(`Random integer stepped range does not contain an ${requiredParity ? "odd" : "even"} value`);
      return randomInt(min, max, { step });
    }
    const firstIndex = minParity === requiredParity ? 0 : 1;
    if (firstIndex > stepCount)
      throw new RangeError(`Random integer range does not contain an ${requiredParity ? "odd" : "even"} value`);
    const matchingCount = Math.floor((stepCount - firstIndex) / 2) + 1;
    return min + ((firstIndex + randomInt(0, matchingCount - 1) * 2) * step);
  };
  const maths = builder.maths as unknown as {
    replaceDigit: (...args: unknown[]) => string;
    sequence: (...args: unknown[]) => unknown;
    number?: (options: AuthoringDigitNumbersOptions) => number;
    numbers?: (options: AuthoringNumbersOptions) => number[];
    numbersFromDigits: (
      digits: readonly number[],
      length: number,
      options?: { reuse?: boolean },
    ) => number[];
  };
  const replaceDigit = maths.replaceDigit.bind(maths);
  const sequence = maths.sequence.bind(maths);
  const numbers = maths.numbers?.bind(maths);
  // Electron can retain a prior prebundled helper during an HMR session. Keep
  // array replacement compatible at the authoring boundary; numeric calls and
  // every other maths helper still use the canonical QuizBuilder method.
  maths.replaceDigit = (value, placeOrReplacements, replacement) =>
    Array.isArray(value)
      ? replaceDigitArray(value, placeOrReplacements, replacement)
      : replaceDigit(value, placeOrReplacements, replacement);
  // Keep the authoring runtime aligned with the source Logics API before the
  // next vendored package build. The current package already accepts the
  // equivalent structured arithmetic definition.
  maths.sequence = (...args) => {
    if (args.length !== 3) return sequence(...args);
    const [start, step, end] = args;
    if (
      typeof start !== "number"
      || typeof step !== "number"
      || typeof end !== "number"
    ) return sequence(...args);
    if (!Number.isFinite(end))
      throw new RangeError("Sequence end must be a finite number");
    if (step === 0) throw new RangeError("Sequence step cannot be 0");
    if ((step > 0 && end < start) || (step < 0 && end > start))
      throw new RangeError("Sequence step must move from start toward end");
    const bounded = sequence({
      start,
      step,
      count: Math.floor((end - start) / step) + 1,
    }) as {
      toArray(): number[];
      toText(...args: unknown[]): string;
    };
    const toText = bounded.toText.bind(bounded);
    bounded.toText = (...textArgs: unknown[]) => {
      const options = textArgs[0];
      if (
        textArgs.length > 0
        && (!options || typeof options !== "object" || Array.isArray(options))
      ) return toText(...textArgs);
      const textOptions = (options ?? {}) as {
        start?: number;
        end?: number;
        ellipsis?: string;
      };
      const values = bounded.toArray();
      const startCount = textOptions.start ?? 5;
      const endCount = textOptions.end ?? 2;
      if (!Number.isInteger(startCount) || startCount < 0)
        throw new RangeError("Sequence text start count must be a non-negative integer");
      if (!Number.isInteger(endCount) || endCount < 0)
        throw new RangeError("Sequence text end count must be a non-negative integer");
      if (values.length <= startCount + endCount) return values.join(", ");
      return [
        ...values.slice(0, startCount),
        textOptions.ellipsis ?? "...",
        ...(endCount === 0 ? [] : values.slice(-endCount)),
      ].filter((value) => value !== "").join(", ");
    };
    return bounded;
  };
  // Keep range generation available while this app still carries an older
  // vendored Logics package. Digit-based calls continue through the canonical
  // implementation when it exists.
  maths.numbers = (options) => {
    if ("start" in options || "end" in options) {
      const { start, end, step = 1, where } = options as AuthoringNumberRangeOptions;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end))
        throw new TypeError("QB.maths.numbers range bounds must be safe integers");
      if (!Number.isSafeInteger(step) || step === 0)
        throw new RangeError("QB.maths.numbers range step must be a non-zero safe integer");
      if ((step > 0 && end < start) || (step < 0 && end > start))
        throw new RangeError("QB.maths.numbers range step must move from start toward end");
      const count = Math.floor((end - start) / step) + 1;
      return Array.from({ length: count }, (_, index) => start + (index * step))
        .filter((value) => where?.(value) ?? true);
    }
    if (numbers) return numbers(options);
    const digitOptions = options as AuthoringDigitNumbersOptions;
    if (digitOptions.odd === true && digitOptions.even === true)
      throw new TypeError("QB.maths.numbers cannot require both odd and even numbers");
    const values = maths.numbersFromDigits(
      digitOptions.digits ?? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      digitOptions.length,
      { reuse: digitOptions.duplicate !== false },
    );
    return values.filter((value) => {
      if (digitOptions.odd === true && value % 2 === 0) return false;
      if (digitOptions.even === true && value % 2 !== 0) return false;
      return digitOptions.where?.(value) ?? true;
    });
  };
  maths.number ??= (options) => {
    const values = maths.numbers!(options);
    if (values.length === 0)
      throw new RangeError("QB.maths.number could not find a number matching the supplied conditions");
    return values[Math.floor(Math.random() * values.length)]!;
  };
  return builder;
}

async function sha256(source: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(source),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

const dynamicBuilder = createDynamicQuestionBuildService({
  createBuilder: createAuthoringQuizBuilder,
  serialize: (value) => QuizValueSerializer.serialize(value),
  deserialize: (value) => QuizValueSerializer.deserialize(value),
  hash: sha256,
});

const DYNAMIC_BUILD_CACHE_LIMIT = 50;
const dynamicBuildCache = new Map<string, ReturnType<typeof dynamicBuilder.build>>();

function cachedDynamicBuild(source: string): ReturnType<typeof dynamicBuilder.build> {
  const cached = dynamicBuildCache.get(source);
  if (cached) return cached;
  if (dynamicBuildCache.size >= DYNAMIC_BUILD_CACHE_LIMIT) {
    const oldest = dynamicBuildCache.keys().next().value;
    if (oldest !== undefined) dynamicBuildCache.delete(oldest);
  }
  const build = dynamicBuilder.build(source).catch((error) => {
    dynamicBuildCache.delete(source);
    throw error;
  });
  dynamicBuildCache.set(source, build);
  return build;
}

function shuffle<T>(values: T[]): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

class QuestionService {
  async buildDynamic(record: ContestQuizQuestionRecord) {
    if (!record.advancedDynamic)
      throw new Error("This question does not contain a dynamic generator.");
    return dynamicBuilder.build(
      QuizTsService.composeTemplateSource(record.advancedDynamic),
    );
  }

  async compileDynamicDraft(
    record: ContestQuizQuestionRecord,
  ): Promise<string | undefined> {
    try {
      return (await this.buildDynamic(record)).compiledJs;
    } catch {
      // Incomplete TypeScript is a valid authoring draft. Omitting compiledJs
      // also prevents publishing from using an older successful compilation.
      return undefined;
    }
  }

  createDynamicDraft(
    record: ContestQuizQuestionRecord,
  ): ContestQuizQuestionRecord {
    if (record.advancedDynamic) return record;
    const staticQuestion = this.loadStatic(record).question;
    const {
      text_en: staticTextEn,
      text_vn: staticTextVn,
      ...staticQuestionRest
    } = staticQuestion;
    const sourceQuestion = {
      ...staticQuestionRest,
      text_en: Array.isArray(staticTextEn)
        ? staticTextEn.join("\n")
        : String(staticTextEn ?? ""),
      ...(staticTextVn !== undefined
        ? {
            text_vn: Array.isArray(staticTextVn)
              ? staticTextVn.join("\n")
              : String(staticTextVn),
          }
        : {}),
    };
    const starterSource = dynamicBuilder.createStarterSource(sourceQuestion);
    const fields = QuizTsService.extractTemplateSourceFields(starterSource);
    return {
      ...record,
      authoringMode: "advanced-dynamic",
      advancedDynamic: {
        paramsGeneratorTs: fields.paramsGeneratorTs,
        questionGeneratorTs: fields.questionGeneratorTs,
        originParamsTs: fields.originParamsTs ?? "{}",
        explanationGeneratorTs:
          fields.explanationGeneratorTs ?? DEFAULT_EXPLANATION_GENERATOR_TS,
      },
    };
  }

  loadStatic(
    record: ContestQuizQuestionRecord,
    shuffleChoices = false,
    current?: RuntimeQuestion,
  ): GeneratedQuestion {
    const sourceAnswer =
      record.answer &&
      typeof record.answer === "object" &&
      !Array.isArray(record.answer)
        ? (record.answer as RuntimeQuestion["answer"])
        : { type: "input", correct: "" };
    const answerType = staticAnswerType(
      sourceAnswer.type,
      Boolean(sourceAnswer.choices && Object.keys(sourceAnswer.choices).length),
    );
    const entries = Object.entries(sourceAnswer.choices ?? {});
    if (
      answerType !== "choice" ||
      sourceAnswer.fixed === true ||
      entries.length < 2 ||
      !shuffleChoices
    ) {
      return {
        question: {
          ...record,
          answer: { ...sourceAnswer, type: answerType },
        } as unknown as RuntimeQuestion,
      };
    }

    const otherEntry = entries.find(([label]) => sourceAnswer.otherChoiceKey === label);
    let ordered = [
      ...shuffle(entries.filter(([label]) => sourceAnswer.otherChoiceKey !== label)),
      ...(otherEntry ? [otherEntry] : []),
    ];
    const currentValues = Object.values(current?.answer.choices ?? {});
    if (ordered.every(([, value], index) => value === currentValues[index]))
      [ordered[0], ordered[1]] = [ordered[1], ordered[0]];

    const correct = new Set(
      (Array.isArray(sourceAnswer.correct)
        ? sourceAnswer.correct
        : [sourceAnswer.correct]
      ).map(String),
    );
    const choices: Record<string, unknown> = {};
    const correctLabels: string[] = [];
    let otherChoiceKey: string | undefined;
    ordered.forEach(([sourceLabel, value], index) => {
      const label = String.fromCharCode(65 + index);
      choices[label] = value;
      if (correct.has(sourceLabel)) correctLabels.push(label);
      if (sourceAnswer.otherChoiceKey === sourceLabel) otherChoiceKey = label;
    });
    const answer = {
      ...sourceAnswer,
      type: answerType,
      choices,
      correct: Array.isArray(sourceAnswer.correct)
        ? correctLabels
        : (correctLabels[0] ?? ""),
      ...(otherChoiceKey ? { otherChoiceKey } : {}),
    };
    return { question: { ...record, answer } as unknown as RuntimeQuestion };
  }

  async generateDynamic(
    record: ContestQuizQuestionRecord,
    original = false,
    quizSharedCode = "",
  ): Promise<GeneratedQuestion> {
    // Dynamic question code is an untrusted authoring draft. Run it outside
    // the renderer so a non-terminating loop cannot freeze Monaco and the rest
    // of GetGo Tools. Node-based unit tests do not expose Web Workers and use
    // the same implementation directly.
    if (typeof window === "undefined" || typeof Worker === "undefined")
      return this.generateDynamicInProcess(record, original, quizSharedCode);
    return dynamicGenerationWorkerClient.generate({ record, original, quizSharedCode });
  }

  async generateDynamicInProcess(
    record: ContestQuizQuestionRecord,
    original = false,
    quizSharedCode = "",
  ): Promise<GeneratedQuestion> {
    if (!record.advancedDynamic)
      throw new Error("This question does not contain a dynamic generator.");
    const source = QuizTsService.composeTemplateSource(record.advancedDynamic);
    const build = await cachedDynamicBuild(source);
    const generated = original
      ? dynamicBuilder.generateOriginalCompiled(build.compiledJs, quizSharedCode)
      : dynamicBuilder.generateCompiled(build.compiledJs, quizSharedCode);
    if (!generated) throw new Error("Question generation returned no result.");
    return generated as GeneratedQuestion;
  }

  async generateReference(
    record: ContestQuizQuestionRecord,
    questions: ContestQuizQuestionRecord[],
    quizSharedCode = "",
  ): Promise<GeneratedQuestion> {
    if (record.authoringMode !== "reference" || !record.reference)
      throw new Error("Select a referenced question first.");
    const byNumber = new Map(
      questions.map((question) => [Number(question.question_no), question]),
    );
    const visited = new Set<number>([Number(record.question_no)]);
    let target = byNumber.get(record.reference.questionNo);
    while (target?.authoringMode === "reference") {
      const number = Number(target.question_no);
      if (visited.has(number)) throw new Error("Question references cannot contain a cycle.");
      visited.add(number);
      target = target.reference
        ? byNumber.get(target.reference.questionNo)
        : undefined;
    }
    if (!target)
      throw new Error(`Referenced question ${record.reference.questionNo} was not found.`);
    const generated = target.advancedDynamic
      ? await this.generateDynamic(target, false, quizSharedCode)
      : this.loadStatic(target, true);
    return {
      ...generated,
      question: {
        ...generated.question,
        question_no: Number(record.question_no),
      },
    };
  }
}

export const questionService = new QuestionService();
