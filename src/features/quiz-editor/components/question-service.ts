import {
  QuizTsService,
  createDynamicQuestionBuildService,
} from "@tnp/getgo-logics/authoring";
import {
  QuizBuilder,
  QuizValueSerializer,
} from "@tnp/getgo-logics/quiz-builder";
import { staticAnswerType } from "../../../features/quiz-editor/domain/answer-types";
import type { ContestQuizQuestionRecord } from "../../../shared/domain/models";

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
  };
}

export interface GeneratedQuestion {
  question: RuntimeQuestion;
  params?: Record<string, unknown>;
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
  createBuilder: () => new QuizBuilder(),
  serialize: (value) => QuizValueSerializer.serialize(value),
  deserialize: (value) => QuizValueSerializer.deserialize(value),
  hash: sha256,
});

function shuffle<T>(values: T[]): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

class QuestionService {
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
  ): Promise<GeneratedQuestion> {
    if (!record.advancedDynamic)
      throw new Error("This question does not contain a dynamic generator.");
    const source = QuizTsService.composeTemplateSource(record.advancedDynamic);
    const generated = original
      ? await dynamicBuilder.generateOriginal(source)
      : await dynamicBuilder.generate(source);
    if (!generated) throw new Error("Question generation returned no result.");
    return generated as GeneratedQuestion;
  }
}

export const questionService = new QuestionService();
