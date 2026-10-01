export function calculateMathFitScale(availableWidth: number, contentWidth: number): number {
  if (!Number.isFinite(availableWidth) || !Number.isFinite(contentWidth)) return 1;
  if (availableWidth <= 0 || contentWidth <= 0 || contentWidth <= availableWidth) return 1;
  return availableWidth / contentWidth;
}

/** Keep ordinary inline fractions legible without changing explicit text/display fraction commands. */
export function normalizeInlineFractionStyle(latex: string, inline: boolean): string {
  if (!inline || !/\\frac\b/.test(latex)) return latex;
  return latex.replace(/\\frac\b/g, "\\dfrac");
}
