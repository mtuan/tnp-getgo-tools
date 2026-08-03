import {
  GetGoDynamicQuestionAiService,
  type GetGoStructuredAiRequest,
  type GetGoStructuredAiResponse,
} from "@tnp/getgo-logics/authoring"
import type { DynamicQuestionFixResult, DynamicQuestionProposalResult, QuizQuestionRecord } from "../core/models.js"

function outputText(payload: Record<string, unknown>): string {
  if (typeof payload.output_text === "string") return payload.output_text
  const output = Array.isArray(payload.output) ? payload.output : []
  for (const item of output) {
    const content = item && typeof item === "object" && Array.isArray((item as { content?: unknown }).content) ? (item as { content: Array<Record<string, unknown>> }).content : []
    for (const part of content) if (typeof part.text === "string") return part.text
  }
  throw new Error("OpenAI returned no structured conversion proposal.")
}

export interface LocalAiConfiguration {
  apiKey?: string
  model?: string
}

class LocalOpenAiProvider {
  constructor(private readonly configuration: LocalAiConfiguration) {}

  async generate(request: GetGoStructuredAiRequest): Promise<GetGoStructuredAiResponse> {
    const apiKey = this.configuration.apiKey?.trim()
    if (!apiKey) throw new Error("Local AI is not configured. Set GETGO_AI_OPENAI_API_KEY in .env and restart GetGo Tools.")
    const model = this.configuration.model?.trim() || "gpt-5.6-terra"
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      signal: AbortSignal.timeout(120_000),
      body: JSON.stringify({
        model,
        reasoning: { effort: "medium" },
        input: [{ role: "system", content: [{ type: "input_text", text: request.systemPrompt }] }, { role: "user", content: [{ type: "input_text", text: JSON.stringify(request.payload) }] }],
        text: { format: { type: "json_schema", name: "getgo_dynamic_question_proposal", strict: true, schema: request.outputSchema }, verbosity: "low" },
        prompt_cache_key: request.promptCacheKey,
      }),
    })
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>
    if (!response.ok) {
      const error = payload.error as { message?: string } | undefined
      throw new Error(error?.message ?? `OpenAI returned HTTP ${response.status}.`)
    }
    const rawUsage = payload.usage as Record<string, unknown> | undefined
    const inputDetails = rawUsage?.input_tokens_details as Record<string, unknown> | undefined
    return {
      output: JSON.parse(outputText(payload)),
      model,
      responseId: typeof payload.id === "string" ? payload.id : undefined,
      usage: {
        inputTokens: Number(rawUsage?.input_tokens ?? 0),
        outputTokens: Number(rawUsage?.output_tokens ?? 0),
        totalTokens: Number(rawUsage?.total_tokens ?? 0),
        cachedInputTokens: Number(inputDetails?.cached_tokens ?? 0),
        cacheWriteTokens: Number(inputDetails?.cache_write_tokens ?? 0),
      },
    }
  }
}

function toAiQuestion(question: QuizQuestionRecord): Record<string, unknown> {
  return Object.fromEntries(["question_no", "category", "text_en", "text_vn", "image_datas", "answer"].filter(key => question[key] !== undefined).map(key => [key, question[key]]))
}

export class LocalAiService {
  private readonly service: GetGoDynamicQuestionAiService

  constructor(configuration: LocalAiConfiguration) {
    this.service = new GetGoDynamicQuestionAiService(new LocalOpenAiProvider(configuration))
  }

  async createDynamicQuestionProposal(input: { question: QuizQuestionRecord; context?: Record<string, unknown>; instructions?: string }): Promise<DynamicQuestionProposalResult> {
    return this.service.createProposal({ question: toAiQuestion(input.question), context: input.context, instructions: input.instructions })
  }

  async fixDynamicQuestion(input: { currentCode: NonNullable<QuizQuestionRecord["advancedDynamic"]>; context?: Record<string, unknown>; diagnostics?: string[]; instructions: string }): Promise<DynamicQuestionFixResult> {
    const { paramsGeneratorTs, questionGeneratorTs, originParamsTs, explanationGeneratorTs } = input.currentCode
    return this.service.fixProposal({ currentCode: { paramsGeneratorTs, questionGeneratorTs, originParamsTs, explanationGeneratorTs }, context: input.context, diagnostics: input.diagnostics, instructions: input.instructions })
  }
}
