export function visibleModelValue(value: string, prefix: string, suffix: string): string | null {
  if (prefix && !value.startsWith(prefix)) return null
  if (suffix && !value.endsWith(suffix)) return null
  return value.slice(prefix.length, suffix ? value.length - suffix.length : value.length)
}
