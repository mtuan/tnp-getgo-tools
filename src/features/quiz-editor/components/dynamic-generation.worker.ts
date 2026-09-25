import { questionService } from "./question-service";
import type {
  DynamicGenerationWorkerRequest,
  DynamicGenerationWorkerResponse,
} from "./dynamic-generation-worker-protocol";

self.onmessage = async (event: MessageEvent<DynamicGenerationWorkerRequest>) => {
  let response: DynamicGenerationWorkerResponse;
  try {
    const generated = await questionService.generateDynamicInProcess(
      event.data.record,
      event.data.original,
      event.data.quizSharedCode,
    );
    response = { id: event.data.id, ok: true, generated };
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    response = {
      id: event.data.id,
      ok: false,
      error: { name: error.name, message: error.message, stack: error.stack },
    };
  }
  self.postMessage(response);
};
