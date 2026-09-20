import type { ContestQuizQuestionRecord } from "../../../shared/domain/models";
import { questionService, type GeneratedQuestion } from "./question-service";

type DynamicGenerationRequest = {
  record: ContestQuizQuestionRecord;
  original: boolean;
  quizSharedCode: string;
};

type DynamicGenerationWorkerResponse =
  | { ok: true; generated: GeneratedQuestion }
  | { ok: false; error: { name: string; message: string; stack?: string } };

self.onmessage = async (event: MessageEvent<DynamicGenerationRequest>) => {
  let response: DynamicGenerationWorkerResponse;
  try {
    const generated = await questionService.generateDynamicInProcess(
      event.data.record,
      event.data.original,
      event.data.quizSharedCode,
    );
    response = { ok: true, generated };
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    response = {
      ok: false,
      error: { name: error.name, message: error.message, stack: error.stack },
    };
  }
  self.postMessage(response);
};
