const imageSourcePattern = /^(?:data:image\/|asset:)|\.(?:avif|gif|jpe?g|png|svg|webp)(?:[?#].*)?$/i

function containsImageValue(value: unknown): boolean {
  if (typeof value === "string") return imageSourcePattern.test(value.trim())
  if (Array.isArray(value)) return value.some(containsImageValue)
  if (!value || typeof value !== "object") return false
  const record = value as Record<string, unknown>
  if (typeof record.type === "string" && ["image", "image_choice", "svg"].includes(record.type.toLowerCase())) return true
  return Object.values(record).some(containsImageValue)
}

/** AI generation currently supports only text-based question and answer data. */
export function questionContainsImages(question: Record<string, unknown>): boolean {
  return containsImageValue(question.image_datas) || containsImageValue(question.answer)
}
