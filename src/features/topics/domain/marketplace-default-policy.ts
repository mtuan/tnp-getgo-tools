import type { ContentV2Quiz, ContentV2Topic } from "./content-v2.js";
import { marketplaceAccessPlan } from "./marketplace-access-plan.js";

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
  const ordered = [...candidates].sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  return ordered.find((quiz) => quiz.id === preferredQuizId)?.id
    ?? ordered.find((quiz) => quiz.preview)?.id
    ?? ordered.at(-1)?.id;
}

export function guestPreviewQuizIds(candidates: readonly GuestPreviewCandidate[]): string[] {
  return marketplaceAccessPlan(candidates).previewIds;
}
