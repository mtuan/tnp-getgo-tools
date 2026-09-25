export interface GenerationErrorDetail {
  summary: string
  detail: string
}

interface SourceSection {
  id: "params" | "question" | "explanation" | "origin"
  startLineNumber: number
  endLineNumber: number
}

interface GenerationSourceContext {
  source: string
  sections: SourceSection[]
}

function errorField(value: object, key: string): unknown {
  return (value as Record<string, unknown>)[key]
}

function parserLocation(message: string): { line: number; column: number } | null {
  const match = /\((\d+):(\d+)\)\s*$/.exec(message)
  return match ? { line: Number(match[1]), column: Number(match[2]) } : null
}

function sourceFrame(source: string, line: number, column: number): string | null {
  const lines = source.split("\n")
  const targetIndex = Math.min(Math.max(0, line - 1), Math.max(0, lines.length - 1))
  if (lines.length === 0) return null
  const start = Math.max(0, targetIndex - 1)
  const end = Math.min(lines.length - 1, targetIndex + 1)
  const width = String(end + 1).length
  const shown = lines.slice(start, end + 1).map((value, offset) => {
    const number = start + offset + 1
    return `${number === targetIndex + 1 ? ">" : " "} ${String(number).padStart(width)} | ${value}`
  })
  const target = lines[targetIndex] ?? ""
  const caretColumn = line > lines.length ? target.length + 1 : Math.max(1, column)
  shown.splice(targetIndex - start + 1, 0, `  ${" ".repeat(width)} | ${" ".repeat(caretColumn - 1)}^`)
  return shown.join("\n")
}

const sectionNames: Record<SourceSection["id"], string> = {
  params: "Parameters generator",
  question: "Question generator",
  explanation: "Explanation generator",
  origin: "Original parameters",
}

export function generationErrorDetail(
  cause: unknown,
  context?: GenerationSourceContext,
): GenerationErrorDetail {
  if (!(cause instanceof Error)) {
    const summary = String(cause)
    return { summary, detail: `Thrown value: ${summary}` }
  }

  const code = errorField(cause, "code")
  const location = parserLocation(cause.message)
  const section = location
    ? context?.sections.find((candidate) => (
        location.line >= candidate.startLineNumber
        && location.line <= candidate.endLineNumber
      ))
    : undefined
  const localLine = location && section
    ? location.line - section.startLineNumber + 1
    : undefined
  const cleanMessage = cause.message.replace(/\s*\(\d+:\d+\)\s*$/, "")
  if (cause.name === "SyntaxError" && location) {
    const field = section ? sectionNames[section.id] : "Dynamic template"
    const shownLine = localLine ?? location.line
    const frame = context ? sourceFrame(context.source, location.line, location.column) : null
    return {
      summary: `${field}, line ${shownLine}:${location.column} — ${cleanMessage}`,
      detail: [
        `Name: ${cause.name}`,
        `Field: ${field}`,
        `Location: line ${shownLine}, column ${location.column}`,
        `Message: ${cleanMessage}`,
        frame ? `Code:\n${frame}` : null,
      ].filter((line): line is string => Boolean(line)).join("\n"),
    }
  }
  const details = [
    `Name: ${cause.name || "Error"}`,
    code == null ? null : `Code: ${String(code)}`,
    `Message: ${cleanMessage}`,
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
    summary: `${cause.name || "Error"}${code == null ? "" : ` [${String(code)}]`}: ${cleanMessage}`,
    detail: details.filter((line): line is string => Boolean(line)).join("\n\n"),
  }
}
