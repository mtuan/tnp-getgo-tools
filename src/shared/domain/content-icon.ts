export const textContentIconThemes = ["violet", "indigo", "blue", "cyan", "teal", "emerald", "lime", "yellow", "amber", "orange", "red", "rose", "pink"] as const;
export type TextContentIconTheme = typeof textContentIconThemes[number];

export const textContentIconColors: Record<TextContentIconTheme, string> = {
  violet: "#7c3aed", indigo: "#4f46e5", blue: "#0284c7", cyan: "#0891b2", teal: "#0d9488", emerald: "#059669", lime: "#65a30d",
  yellow: "#ca8a04", amber: "#f59e0b", orange: "#ea580c", red: "#dc2626", rose: "#e11d48", pink: "#db2777",
};

export interface TextContentIcon {
  type: "text";
  text: string;
  theme: TextContentIconTheme;
}

export type ContentIcon = string | TextContentIcon;
const colorPattern = /^#[0-9a-f]{6}$/i;
const textIconPattern = /^(?:[\p{L}\p{N}]{4,6}|[\p{L}\p{N}]{2,3}-[\p{L}\p{N}]{2,3})$/u;
const normalizeColor = (value: unknown) => typeof value === "string" && colorPattern.test(value) ? value.toLowerCase() : null;

export const isTextContentIconText = (value: string) => textIconPattern.test(value);

export function parseTextContentIcon(value: unknown): TextContentIcon | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const icon = value as Partial<TextContentIcon> & { theme?: TextContentIconTheme };
    const text = typeof icon.text === "string" ? icon.text.toLocaleUpperCase() : "";
    const legacy = icon as Partial<TextContentIcon> & { color?: unknown; backgroundColor?: unknown };
    const color = normalizeColor(legacy.backgroundColor) ?? normalizeColor(legacy.color);
    const theme = textContentIconThemes.includes(icon.theme as TextContentIconTheme)
      ? icon.theme as TextContentIconTheme
      : textContentIconThemes.find(candidate => textContentIconColors[candidate] === color);
    return icon.type === "text" && theme && isTextContentIconText(text)
      ? { type: "text", text, theme }
      : null;
  }
  if (typeof value !== "string" || !value.startsWith("text:")) return null;
  const parts = value.slice(5).split(":");
  const explicitColor = normalizeColor(parts[0]);
  const theme = textContentIconThemes.includes(parts[0] as TextContentIconTheme) ? parts[0] as TextContentIconTheme : null;
  const color = explicitColor ?? (theme ? textContentIconColors[theme] : textContentIconColors.violet);
  const legacyTextColor = normalizeColor(parts[1]);
  const text = (explicitColor || theme ? parts.slice(legacyTextColor ? 2 : 1) : parts).join(":").toLocaleUpperCase();
  const resolvedTheme = theme ?? textContentIconThemes.find(candidate => textContentIconColors[candidate] === color) ?? "violet";
  return isTextContentIconText(text) ? { type: "text", text, theme: resolvedTheme } : null;
}

export function createTextContentIcon(text: string, theme: TextContentIconTheme): TextContentIcon {
  return { type: "text", text: text.toLocaleUpperCase(), theme };
}

export function legacyContentIcon(icon: ContentIcon | undefined): string | undefined {
  return typeof icon === "string" ? icon : icon ? `text:${icon.theme}:${icon.text}` : undefined;
}
