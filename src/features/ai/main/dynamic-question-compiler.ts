import { createHash } from "node:crypto";
import { QuizTsService, createDynamicQuestionBuildService } from "@tnp/getgo-logics/authoring";
import type { ContestQuizQuestionRecord } from "../../../shared/domain/models.js";

const compiler = createDynamicQuestionBuildService({
  createBuilder: () => {
    throw new Error("The compiler does not execute question code.");
  },
  serialize: <T>(value: T) => value,
  deserialize: <T>(value: T) => value,
  hash: async (source: string) => createHash("sha256").update(source).digest("hex"),
});

export async function compileDynamicQuestion(record: ContestQuizQuestionRecord): Promise<string> {
  if (!record.advancedDynamic) throw new Error("Generated dynamic question code is missing.");
  return (await compiler.build(QuizTsService.composeTemplateSource(record.advancedDynamic))).compiledJs;
}
