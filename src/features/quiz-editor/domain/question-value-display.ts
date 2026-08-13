interface FractionLike {
  $type?: unknown
  n: number
  d: number
  value?: unknown
  toMixed?: unknown
}

function fractionParts(value: unknown): { n: number; d: number } | null {
  if (!value || typeof value !== "object") return null
  const candidate = value as Partial<FractionLike>
  const n = candidate.n
  const d = candidate.d
  if (typeof n !== "number" || typeof d !== "number" || !Number.isInteger(n) || !Number.isInteger(d) || d === 0) return null
  const tagged = candidate.$type === "fraction"
  const liveFraction = typeof candidate.toMixed === "function"
  const clonedFraction = typeof candidate.value === "number" && candidate.value === n / d
  return tagged || liveFraction || clonedFraction ? { n, d } : null
}

function mixedFraction(n: number, d: number): string {
  const whole = Math.trunc(n / d)
  const remainder = Math.abs(n % d)
  if (remainder === 0) return String(whole)
  if (whole === 0) return `${n}/${d}`
  return `${whole} ${remainder}/${d}`
}

export function displayQuestionValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(displayQuestionValue).join(" ")
  const fraction = fractionParts(value)
  if (fraction) return mixedFraction(fraction.n, fraction.d)
  return String(value ?? "")
}
