import type {
  DynamicQuestionProposalResult,
  QuizQuestionRecord,
} from "./models.js";

type CodexQuestion = QuizQuestionRecord;
type CodexProposal = DynamicQuestionProposalResult;

declare module "./models.js" {
  interface DesktopApi {
    createDynamicQuestionProposalWithCodex(input: {
      question: CodexQuestion;
      context?: Record<string, unknown>;
      instructions?: string;
    }): Promise<CodexProposal>;
  }
}
