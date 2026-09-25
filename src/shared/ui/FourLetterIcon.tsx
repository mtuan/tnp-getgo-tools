import { createTextContentIcon, parseTextContentIcon, textContentIconColors, textContentIconRows, textContentIconThemes, type TextContentIconTheme } from "../domain/content-icon"
import type { CSSProperties } from "react"

export const fourLetterIconPrefix = "text:"
export const fourLetterIconThemes = textContentIconThemes
export const fourLetterIconColors = textContentIconColors
export const fourLetterIconThemeGrades = ["K", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"] as const
export type FourLetterIconTheme = TextContentIconTheme

export interface FourLetterIconValue {
  code: string
  theme: FourLetterIconTheme
}

export function parseFourLetterIcon(value?: unknown): FourLetterIconValue | null {
  const icon = parseTextContentIcon(value)
  if (!icon) return null
  return { code: icon.text, theme: icon.theme }
}

export function encodeFourLetterIcon(code: string, theme: FourLetterIconTheme) {
  return createTextContentIcon(code, theme)
}

export function FourLetterIcon({ code, theme = "violet", label, className = "" }: { code: string; theme?: FourLetterIconTheme; label?: string; className?: string }) {
  const rows = textContentIconRows(code) ?? [code.toLocaleUpperCase(), ""]
  const accessibleText = rows.filter(Boolean).join(" ")
  const resolvedColor = textContentIconColors[theme]
  return <span className={`four-letter-icon ${className}`.trim()} style={{ "--monogram-border": resolvedColor, "--monogram-from": resolvedColor, "--monogram-to": resolvedColor } as CSSProperties} role="img" aria-label={label ? `${label} (${accessibleText})` : accessibleText}>
    {rows.map((row, rowIndex) => <span className="four-letter-icon-row" style={{ "--monogram-characters": Math.max(1, Array.from(row).length) } as CSSProperties} aria-hidden="true" key={rowIndex}>
      <span>{row}</span>
    </span>)}
  </span>
}
