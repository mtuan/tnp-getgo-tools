import { createTextContentIcon, parseTextContentIcon, textContentIconColors, textContentIconThemes, type TextContentIconTheme } from "../domain/content-icon"
import type { CSSProperties } from "react"

export const fourLetterIconPrefix = "text:"
export const fourLetterIconThemes = textContentIconThemes
export const fourLetterIconColors = textContentIconColors
export const fourLetterIconThemeGrades = ["K", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"] as const
export type FourLetterIconTheme = TextContentIconTheme

export interface FourLetterIconValue {
  code: string
  color: string
  theme: FourLetterIconTheme
}

export function parseFourLetterIcon(value?: unknown): FourLetterIconValue | null {
  const icon = parseTextContentIcon(value)
  if (!icon) return null
  const theme = textContentIconThemes.find(candidate => textContentIconColors[candidate] === icon.color) ?? "violet"
  return { code: icon.text, color: icon.color, theme }
}

export function encodeFourLetterIcon(code: string, theme: FourLetterIconTheme) {
  return createTextContentIcon(code, textContentIconColors[theme])
}

export function FourLetterIcon({ code, color, theme = "violet", label, className = "" }: { code: string; color?: string; theme?: FourLetterIconTheme; label?: string; className?: string }) {
  const letters = Array.from(code).slice(0, 4)
  const resolvedColor = color ?? textContentIconColors[theme]
  return <span className={`four-letter-icon ${className}`.trim()} style={{ "--monogram-border": resolvedColor, "--monogram-from": resolvedColor, "--monogram-to": resolvedColor } as CSSProperties} role="img" aria-label={label ? `${label} (${letters.join("")})` : letters.join("")}>
    {Array.from({ length: 4 }, (_, index) => <span aria-hidden="true" key={index}>{letters[index] ?? ""}</span>)}
  </span>
}
