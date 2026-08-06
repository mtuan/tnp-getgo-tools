export const questionStatuses = ["verified", "rejected"] as const
export type BuiltInQuestionStatus = typeof questionStatuses[number]
export type StoredQuestionStatus = string

export function questionStatus(question: { status?: unknown; verified?: unknown }): StoredQuestionStatus {
  if (typeof question.status === "string" && question.status.trim()) return question.status.trim()
  return question.verified === true ? "verified" : "pending"
}

export function questionIsVerified(question: { status?: unknown; verified?: unknown }): boolean {
  return questionStatus(question) === "verified"
}

export function withQuestionStatus<T extends { status?: unknown; verified?: unknown }>(question: T, status: string): T {
  const next = { ...question } as T
  delete next.verified
  if (status && status !== "pending") next.status = status
  else delete next.status
  return next
}
