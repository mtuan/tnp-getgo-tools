export const marketplaceTopicStates = [
  "listed",
  "featured",
  "unlisted",
  "removed",
] as const;

export type MarketplaceTopicState = (typeof marketplaceTopicStates)[number];

type MarketplaceStateMetadata = {
  state?: MarketplaceTopicState;
  listed?: boolean;
  featured?: boolean;
};

export function marketplaceTopicState(
  metadata?: MarketplaceStateMetadata,
): MarketplaceTopicState {
  if (metadata?.state) return metadata.state;
  if (metadata?.featured) return "featured";
  return metadata?.listed === false ? "unlisted" : "listed";
}

export function withMarketplaceTopicState<T extends MarketplaceStateMetadata>(
  metadata: T | undefined,
  state: MarketplaceTopicState,
): T & MarketplaceStateMetadata {
  return {
    ...metadata,
    state,
    listed: state === "listed" || state === "featured",
    featured: state === "featured",
  } as T & MarketplaceStateMetadata;
}
