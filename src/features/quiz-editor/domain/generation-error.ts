export interface GenerationErrorDetail {
  summary: string
  detail: string
}

function errorField(value: object, key: string): unknown {
  return (value as Record<string, unknown>)[key]
}

export function generationErrorDetail(cause: unknown): GenerationErrorDetail {
  if (!(cause instanceof Error)) {
    const summary = String(cause)
    return { summary, detail: `Thrown value: ${summary}` }
  }

  const code = errorField(cause, "code")
  const details = [
    `Name: ${cause.name || "Error"}`,
    code == null ? null : `Code: ${String(code)}`,
    `Message: ${cause.message}`,
    cause.stack ? `Stack:\n${cause.stack}` : null,
  ]
  let nested = errorField(cause, "cause")
  let depth = 0
  while (nested != null && depth < 5) {
    depth += 1
    if (nested instanceof Error) {
      const nestedCode = errorField(nested, "code")
      details.push(
        `Cause ${depth}: ${nested.name}: ${nested.message}`,
        nestedCode == null ? null : `Cause ${depth} code: ${String(nestedCode)}`,
        nested.stack ? `Cause ${depth} stack:\n${nested.stack}` : null,
      )
      nested = errorField(nested, "cause")
    } else {
      details.push(`Cause ${depth}: ${String(nested)}`)
      nested = null
    }
  }

  return {
    summary: `${cause.name || "Error"}${code == null ? "" : ` [${String(code)}]`}: ${cause.message}`,
    detail: details.filter((line): line is string => Boolean(line)).join("\n\n"),
  }
}
