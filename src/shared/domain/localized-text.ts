export type LocalizedText = string | { en: string; vi: string };

export function localizedText(
  value: LocalizedText,
  locale: "en" | "vi" = "en",
): string {
  return typeof value === "string" ? value : value[locale] || value.en || value.vi;
}
