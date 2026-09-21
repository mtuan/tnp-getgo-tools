import type { ContestQuizQuestionRecord } from "../../../shared/domain/models";
import type { GeneratedQuestion } from "./question-service";

export type DynamicGenerationInput = {
  record: ContestQuizQuestionRecord;
  original: boolean;
  quizSharedCode: string;
};

export type DynamicGenerationWorkerRequest = DynamicGenerationInput & {
  id: number;
};

export type DynamicGenerationWorkerResponse =
  | { id: number; ok: true; generated: GeneratedQuestion }
  | { id: number; ok: false; error: { name: string; message: string; stack?: string } };
