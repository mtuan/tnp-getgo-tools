import type { ContentV2Quiz, ContentV2Topic } from "./content-v2.js";

export const marketplaceTopicDefaults = {
  preview: true,
  experimental: false,
  pricing: { type: "subscription" as const, currency: "VND" },
};

export function withMarketplaceTopicDefaults(topic: ContentV2Topic): ContentV2Topic {
  return {
    ...topic,
    marketplace: {
      ...marketplaceTopicDefaults,
      ...topic.marketplace,
      pricing: topic.marketplace?.pricing ?? marketplaceTopicDefaults.pricing,
    },
  } as ContentV2Topic;
}

export function withMarketplaceQuizDefaults(quiz: ContentV2Quiz): ContentV2Quiz {
  return {
    ...quiz,
    marketplace: { preview: false, ...quiz.marketplace },
  } as ContentV2Quiz;
}

export interface GuestPreviewCandidate {
  id: string;
  order: number;
  preview: boolean;
  questionCount: number;
  reviewedQuestionCount: number;
}

export function guestPreviewQuizId(
  candidates: readonly GuestPreviewCandidate[],
  preferredQuizId?: string,
): string | undefined {
  const eligible = candidates
    .filter((quiz) => quiz.questionCount > 0 && quiz.questionCount === quiz.reviewedQuestionCount)
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  return eligible.find((quiz) => quiz.id === preferredQuizId)?.id
    ?? eligible.find((quiz) => quiz.preview)?.id
    ?? eligible[0]?.id;
}
