import type {
  DynamicGenerationInput,
  DynamicGenerationWorkerRequest,
  DynamicGenerationWorkerResponse,
} from "./dynamic-generation-worker-protocol";
import type { GeneratedQuestion } from "./question-service";

const GENERATION_TIMEOUT_MS = 2_000;

type PendingGeneration = {
  request: DynamicGenerationWorkerRequest;
  resolve: (generated: GeneratedQuestion) => void;
  reject: (error: Error) => void;
};

class DynamicGenerationWorkerClient {
  private worker: Worker | null = null;
  private active: PendingGeneration | null = null;
  private queue: PendingGeneration[] = [];
  private timeout: number | null = null;
  private nextId = 1;

  constructor() {
    // Start loading the module worker with the editor instead of making the
    // first Generate click pay its complete startup cost.
    if (typeof window !== "undefined" && typeof Worker !== "undefined")
      this.ensureWorker();
  }

  generate(input: DynamicGenerationInput): Promise<GeneratedQuestion> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        request: { ...input, id: this.nextId++ },
        resolve,
        reject,
      });
      this.pump();
    });
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(
      new URL("./dynamic-generation.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.onmessage = (event: MessageEvent<DynamicGenerationWorkerResponse>) => {
      if (worker !== this.worker || event.data.id !== this.active?.request.id) return;
      const active = this.takeActive();
      if (!active) return;
      if (event.data.ok) active.resolve(event.data.generated);
      else {
        const error = new Error(event.data.error.message);
        error.name = event.data.error.name;
        error.stack = event.data.error.stack;
        active.reject(error);
      }
      this.pump();
    };
    worker.onerror = (event) => {
      if (worker !== this.worker) return;
      const active = this.takeActive();
      this.replaceWorker();
      active?.reject(new Error(event.message || "Dynamic question worker failed."));
      this.pump();
    };
    this.worker = worker;
    return worker;
  }

  private pump(): void {
    if (this.active || this.queue.length === 0) return;
    this.active = this.queue.shift()!;
    const worker = this.ensureWorker();
    this.timeout = window.setTimeout(() => {
      const active = this.takeActive();
      this.replaceWorker();
      active?.reject(new Error(
        `Question generation exceeded ${GENERATION_TIMEOUT_MS / 1_000} seconds. Check the dynamic code for an infinite loop.`,
      ));
      this.pump();
    }, GENERATION_TIMEOUT_MS);
    worker.postMessage(this.active.request);
  }

  private takeActive(): PendingGeneration | null {
    if (this.timeout !== null) window.clearTimeout(this.timeout);
    this.timeout = null;
    const active = this.active;
    this.active = null;
    return active;
  }

  private replaceWorker(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}

export const dynamicGenerationWorkerClient = new DynamicGenerationWorkerClient();
