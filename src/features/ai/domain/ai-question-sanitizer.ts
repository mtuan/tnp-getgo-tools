const embeddedImagePattern = /^data:image\//i
const inlineSvgPattern = /^\s*<svg(?:\s|>)/i
const blobUrlPattern = /^blob:/i
const imagePayloadKeys = new Set(["base64", "blob", "buffer", "bytes", "content", "data", "file"])

function isBinaryValue(value: unknown): boolean {
  return value instanceof ArrayBuffer || ArrayBuffer.isView(value)
}

function sanitizeValue(value: unknown, imageContext = false): unknown {
  if (typeof value === "string") {
    const trimmed = value.trim()
    const compact = trimmed.replace(/\s/g, "")
    const isLikelyRawBase64 = compact.length >= 128
      && compact.length % 4 === 0
      && /^[a-z0-9+/]+={0,2}$/i.test(compact)
    if (embeddedImagePattern.test(trimmed)
      || (imageContext && (inlineSvgPattern.test(trimmed) || blobUrlPattern.test(trimmed) || isLikelyRawBase64))) {
      return "[image content omitted]"
    }
    return value
  }
  if (isBinaryValue(value)) return "[binary content omitted]"
  if (Array.isArray(value)) return value.map(item => sanitizeValue(item, imageContext))
  if (!value || typeof value !== "object") return value

  const source = value as Record<string, unknown>
  const isImageObject = imageContext || (typeof source.type === "string" && ["image", "image_choice", "svg"].includes(source.type.toLowerCase()))
  return Object.fromEntries(Object.entries(source).map(([key, item]) => [
    key,
    isImageObject && imagePayloadKeys.has(key.toLowerCase())
      ? "[image content omitted]"
      : sanitizeValue(item, isImageObject),
  ]))
}

/**
 * Build the text-only question payload used by AI requests.
 * Asset references are preserved, but image bytes and embedded payloads are
 * always replaced before the request crosses the provider boundary.
 */
export function sanitizeQuestionForAi(question: Record<string, unknown>): Record<string, unknown> {
  const allowedFields = ["question_no", "category", "text_en", "text_vn", "image_datas", "answer"]
  return Object.fromEntries(allowedFields
    .filter(key => question[key] !== undefined)
    .map(key => [key, sanitizeValue(question[key], key === "image_datas")]))
}
