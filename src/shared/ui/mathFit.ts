export function calculateMathFitScale(availableWidth: number, contentWidth: number): number {
  if (!Number.isFinite(availableWidth) || !Number.isFinite(contentWidth)) return 1;
  if (availableWidth <= 0 || contentWidth <= 0 || contentWidth <= availableWidth) return 1;
  return availableWidth / contentWidth;
}
