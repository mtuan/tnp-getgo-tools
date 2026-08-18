import { createHash } from "node:crypto";
import { QUIZ_ANSWER_TYPES, type IQuizAnswer } from "@tnp/getgo-logics";
import type { QuizQuestionRecord } from "../../../shared/domain/models.js";

const quizAnswerTypes = new Set<string>(QUIZ_ANSWER_TYPES);

export interface PublishedContestQuestion {
  question_no: number;
  category?: string;
  text_en: string | string[];
  text_vn?: string | string[];
  image_datas?: string[];
  explanation?: { en: string; vi?: string };
  answer: {
    type: IQuizAnswer["type"];
    correct: string | number | string[];
    choices?: Record<string, string | number | Record<string, unknown>>;
    inputs?: Array<{
      question_en: string;
      question_vn?: string;
      inputType?: "text" | "number" | "date";
      unit?: string;
    }>;
    unit?: string;
    otherChoiceKey?: string;
    fixed?: boolean;
  };
  dynamic?: {
    paramsGeneratorTs: string;
    questionGeneratorTs: string;
    originParamsTs: string;
    explanationGeneratorTs: string;
  };
}

export interface PublishedAlphabetQuestion {
  question_no: number;
  type: "alphabet";
  letter: string;
  uppercase: string;
  lowercase: string;
  pronunciation?: string;
}

export type PublishedQuestion =
  PublishedContestQuestion | PublishedAlphabetQuestion;

export function hashPublishedQuiz(
  metadata: { title: string; icon?: string; grade: string | null; round: string | null; year: string | null },
  questionHash: string,
): string {
  return createHash("sha256").update(JSON.stringify({
    title: metadata.title,
    icon: metadata.icon ?? null,
    grade: metadata.grade,
    round: metadata.round,
    year: metadata.year,
    questionHash,
  })).digest("hex");
}

function text(
  value: unknown,
  field: string,
  required = false,
): string | string[] | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.every((item) => typeof item === "string"))
    return [...value];
  if (!required && value === undefined) return undefined;
  throw new Error(`${field} must be text or an array of text.`);
}

function plainRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${field} must be an object.`);
  return value as Record<string, unknown>;
}

export function sanitizePublishedQuestion(
  record: QuizQuestionRecord,
): PublishedQuestion {
  const questionNo = Number(record.question_no);
  if (!Number.isInteger(questionNo) || questionNo < 1)
    throw new Error("question_no must be a positive integer.");
  if (record.type === "alphabet") {
    const required = (value: unknown, field: string): string => {
      if (typeof value !== "string" || !value.trim())
        throw new Error(`Question ${questionNo} ${field} is required.`);
      return value;
    };
    return {
      question_no: questionNo,
      type: "alphabet",
      letter: required(record.letter, "letter"),
      uppercase: required(record.uppercase, "uppercase"),
      lowercase: required(record.lowercase, "lowercase"),
      ...(typeof record.pronunciation === "string" && record.pronunciation
        ? { pronunciation: record.pronunciation }
        : {}),
    };
  }
  const answer = plainRecord(record.answer, `Question ${questionNo} answer`);
  if (typeof answer.type !== "string" || !answer.type)
    throw new Error(`Question ${questionNo} answer.type is required.`);
  if (!quizAnswerTypes.has(answer.type))
    throw new Error(`Question ${questionNo} answer.type ${answer.type} is not supported for publishing.`);
  const correct = answer.correct;
  if (!(
    typeof correct === "string" ||
    typeof correct === "number" ||
    (Array.isArray(correct) &&
      correct.every((item) => typeof item === "string"))
  )) {
    throw new Error(`Question ${questionNo} answer.correct is invalid.`);
  }
  const result: PublishedQuestion = {
    question_no: questionNo,
    text_en: text(record.text_en, `Question ${questionNo} text_en`, true)!,
    answer: { type: answer.type as IQuizAnswer["type"], correct },
  };
  if (typeof record.category === "string") result.category = record.category;
  const textVn = text(record.text_vn, `Question ${questionNo} text_vn`);
  if (textVn !== undefined) result.text_vn = textVn;
  if (record.image_datas !== undefined) {
    if (
      !Array.isArray(record.image_datas) ||
      !record.image_datas.every(
        (item) => typeof item === "string" && item.startsWith("asset:"),
      )
    ) {
      throw new Error(
        `Question ${questionNo} image_datas must contain only asset references.`,
      );
    }
    result.image_datas = [...record.image_datas];
  }
  if (record.explanation !== undefined) {
    const explanation = plainRecord(
      record.explanation,
      `Question ${questionNo} explanation`,
    );
    if (
      typeof explanation.en !== "string" ||
      (explanation.vi !== undefined && typeof explanation.vi !== "string")
    ) {
      throw new Error(`Question ${questionNo} explanation is invalid.`);
    }
    result.explanation = {
      en: explanation.en,
      ...(typeof explanation.vi === "string" ? { vi: explanation.vi } : {}),
    };
  }
  if (answer.choices !== undefined)
    result.answer.choices = structuredClone(
      plainRecord(answer.choices, `Question ${questionNo} answer.choices`),
    ) as PublishedContestQuestion["answer"]["choices"];
  if (answer.inputs !== undefined) {
    if (!Array.isArray(answer.inputs))
      throw new Error(`Question ${questionNo} answer.inputs must be an array.`);
    if (answer.type !== "multiple_input")
      throw new Error(`Question ${questionNo} answer.inputs requires answer.type multiple_input.`);
    if (!Array.isArray(correct) || correct.length !== answer.inputs.length || answer.inputs.length < 2)
      throw new Error(`Question ${questionNo} multiple inputs and correct answers must have the same length of at least two.`);
    result.answer.inputs = answer.inputs.map((rawPart, index) => {
      const part = plainRecord(rawPart, `Question ${questionNo} answer.inputs[${index}]`);
      if (typeof part.question_en !== "string" || !part.question_en.trim())
        throw new Error(`Question ${questionNo} input part ${index + 1} requires question_en.`);
      if (part.question_vn !== undefined && typeof part.question_vn !== "string")
        throw new Error(`Question ${questionNo} input part ${index + 1} question_vn is invalid.`);
      if (part.inputType !== undefined && !["text", "number", "date"].includes(String(part.inputType)))
        throw new Error(`Question ${questionNo} input part ${index + 1} inputType is invalid.`);
      if (part.unit !== undefined && typeof part.unit !== "string")
        throw new Error(`Question ${questionNo} input part ${index + 1} unit is invalid.`);
      return {
        question_en: part.question_en,
        ...(typeof part.question_vn === "string" && part.question_vn ? { question_vn: part.question_vn } : {}),
        ...(typeof part.inputType === "string" ? { inputType: part.inputType as "text" | "number" | "date" } : {}),
        ...(typeof part.unit === "string" && part.unit ? { unit: part.unit } : {}),
      };
    });
  }
  if (typeof answer.unit === "string") result.answer.unit = answer.unit;
  if (typeof answer.otherChoiceKey === "string")
    result.answer.otherChoiceKey = answer.otherChoiceKey;
  if (typeof answer.fixed === "boolean") result.answer.fixed = answer.fixed;
  if (record.advancedDynamic !== undefined) {
    const dynamic = plainRecord(
      record.advancedDynamic,
      `Question ${questionNo} advancedDynamic`,
    );
    const keys = [
      "paramsGeneratorTs",
      "questionGeneratorTs",
      "originParamsTs",
      "explanationGeneratorTs",
    ] as const;
    for (const key of keys)
      if (typeof dynamic[key] !== "string")
        throw new Error(
          `Question ${questionNo} advancedDynamic.${key} is required.`,
        );
    result.dynamic = {
      paramsGeneratorTs: dynamic.paramsGeneratorTs as string,
      questionGeneratorTs: dynamic.questionGeneratorTs as string,
      originParamsTs: dynamic.originParamsTs as string,
      explanationGeneratorTs: dynamic.explanationGeneratorTs as string,
    };
  }
  return result;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

export function canonicalQuestionJson(questions: PublishedQuestion[]): string {
  return JSON.stringify(
    canonicalize(
      [...questions].sort(
        (left, right) => left.question_no - right.question_no,
      ),
    ),
  );
}

export function hashPublishedQuestions(questions: PublishedQuestion[]): string {
  return createHash("sha256")
    .update(canonicalQuestionJson(questions))
    .digest("hex");
}
