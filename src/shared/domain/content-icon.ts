export const textContentIconThemes = ["violet", "indigo", "blue", "cyan", "teal", "emerald", "lime", "yellow", "amber", "orange", "red", "rose", "pink"] as const;
export type TextContentIconTheme = typeof textContentIconThemes[number];

export const textContentIconColors: Record<TextContentIconTheme, string> = {
  violet: "#7c3aed", indigo: "#4f46e5", blue: "#0284c7", cyan: "#0891b2", teal: "#0d9488", emerald: "#059669", lime: "#65a30d",
  yellow: "#ca8a04", amber: "#f59e0b", orange: "#ea580c", red: "#dc2626", rose: "#e11d48", pink: "#db2777",
};

export interface TextContentIcon {
  type: "text";
  text: string;
  color: string;
}

export type ContentIcon = string | TextContentIcon;
const colorPattern = /^#[0-9a-f]{6}$/i;
const normalizeColor = (value: unknown) => typeof value === "string" && colorPattern.test(value) ? value.toLowerCase() : null;

export function parseTextContentIcon(value: unknown): TextContentIcon | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const icon = value as Partial<TextContentIcon> & { theme?: TextContentIconTheme };
    const text = typeof icon.text === "string" ? icon.text.toLocaleUpperCase() : "";
    const color = normalizeColor(icon.color) ?? (icon.theme && textContentIconColors[icon.theme]);
    return icon.type === "text" && color && /^[\p{L}\p{N}]{4}$/u.test(text)
      ? { type: "text", text, color }
      : null;
  }
  if (typeof value !== "string" || !value.startsWith("text:")) return null;
  const parts = value.slice(5).split(":");
  const explicitColor = normalizeColor(parts[0]);
  const theme = textContentIconThemes.includes(parts[0] as TextContentIconTheme) ? parts[0] as TextContentIconTheme : null;
  const color = explicitColor ?? (theme ? textContentIconColors[theme] : textContentIconColors.violet);
  const text = (explicitColor || theme ? parts.slice(1) : parts).join(":").toLocaleUpperCase();
  return /^[\p{L}\p{N}]{4}$/u.test(text) ? { type: "text", text, color } : null;
}

export function createTextContentIcon(text: string, color: string): TextContentIcon {
  return { type: "text", text: text.toLocaleUpperCase(), color: normalizeColor(color) ?? textContentIconColors.violet };
}

export function legacyContentIcon(icon: ContentIcon | undefined): string | undefined {
  return typeof icon === "string" ? icon : icon ? `text:${icon.color}:${icon.text}` : undefined;
}
