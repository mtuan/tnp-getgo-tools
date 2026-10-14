export interface MarketplaceAccessQuizCandidate {
  id: string;
  order: number;
  questionCount: number;
  reviewedQuestionCount: number;
}

export interface MarketplaceAccessPlan {
  previewIds: string[];
  freeIds: string[];
  inheritedIds: string[];
}

export function marketplaceAccessCounts(quizCount: number): { preview: number; free: number } {
  if (quizCount <= 0) return { preview: 0, free: 0 };
  const desiredFree = quizCount > 10 ? 4 : quizCount > 5 ? 3 : 2;
  return {
    preview: quizCount > 10 ? 2 : 1,
    free: Math.min(desiredFree, Math.floor((quizCount - 1) / 2)),
  };
}

export function marketplaceAccessPlan(candidates: readonly MarketplaceAccessQuizCandidate[]): MarketplaceAccessPlan {
  const ordered = [...candidates].sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  const counts = marketplaceAccessCounts(ordered.length);
  const previewIds = ordered.slice(-counts.preview).map(quiz => quiz.id);
  const freeIds = ordered.slice(0, counts.free).map(quiz => quiz.id);
  const free = new Set(freeIds);
  return {
    previewIds,
    freeIds,
    inheritedIds: ordered.filter(quiz => !free.has(quiz.id)).map(quiz => quiz.id),
  };
}
