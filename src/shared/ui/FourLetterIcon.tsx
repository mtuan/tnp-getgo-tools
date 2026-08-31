export const fourLetterIconPrefix = "text:"
export const fourLetterIconThemes = ["violet", "indigo", "blue", "cyan", "teal", "emerald", "lime", "yellow", "amber", "orange", "red", "rose", "pink"] as const
export const fourLetterIconThemeGrades = ["K", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"] as const
export type FourLetterIconTheme = typeof fourLetterIconThemes[number]

export interface FourLetterIconValue {
  code: string
  theme: FourLetterIconTheme
}

export function parseFourLetterIcon(value?: string): FourLetterIconValue | null {
  if (!value?.startsWith(fourLetterIconPrefix)) return null
  const parts = value.slice(fourLetterIconPrefix.length).split(":")
  const themed = fourLetterIconThemes.includes(parts[0] as FourLetterIconTheme)
  const theme = themed ? parts[0] as FourLetterIconTheme : "violet"
  const rawCode = themed ? parts.slice(1).join(":") : parts.join(":")
  const code = Array.from(rawCode.toLocaleUpperCase().replace(/[^\p{L}\p{N}]/gu, "")).slice(0, 4).join("")
  return Array.from(code).length === 4 ? { code, theme } : null
}

export function encodeFourLetterIcon(code: string, theme: FourLetterIconTheme): string {
  return `${fourLetterIconPrefix}${theme}:${code}`
}

export function FourLetterIcon({ code, theme = "violet", label, className = "" }: { code: string; theme?: FourLetterIconTheme; label?: string; className?: string }) {
  const letters = Array.from(code).slice(0, 4)
  return <span className={`four-letter-icon four-letter-icon-${theme} ${className}`.trim()} role="img" aria-label={label ? `${label} (${letters.join("")})` : letters.join("")}>
    {Array.from({ length: 4 }, (_, index) => <span aria-hidden="true" key={index}>{letters[index] ?? ""}</span>)}
  </span>
}
