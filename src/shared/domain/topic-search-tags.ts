function textValues(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(textValues);
  if (value && typeof value === "object")
    return Object.values(value as Record<string, unknown>).flatMap(textValues);
  return [];
}

export function automaticMarketplaceTopicTags(title: unknown): string[] {
  const tags = new Map<string, string>();
  for (const source of textValues(title)) {
    const chunks = source.trim().split(/\s+/).filter(Boolean);
    for (const chunk of chunks) {
      const parts = chunk.match(/[\p{L}\p{N}]+/gu) ?? [];
      for (const part of parts) tags.set(part.toLocaleLowerCase(), part);
      const compact = parts.join("");
      if (parts.length > 1 && compact) tags.set(compact.toLocaleLowerCase(), compact);
    }
  }
  return [...tags.values()];
}
