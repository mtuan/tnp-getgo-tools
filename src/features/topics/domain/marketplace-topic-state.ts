export const marketplaceTopicStates = [
  "listed",
  "featured",
  "hidden",
  "unlisted",
] as const;

export type MarketplaceTopicState = (typeof marketplaceTopicStates)[number];

type MarketplaceStateMetadata = {
  state?: MarketplaceTopicState;
  listed?: boolean;
  featured?: boolean;
};

export function marketplaceTopicState(
  metadata?: MarketplaceStateMetadata | { state?: string; listed?: boolean; featured?: boolean },
): MarketplaceTopicState {
  if (metadata?.state === "removed") return "unlisted";
  if (metadata?.state && marketplaceTopicStates.includes(metadata.state as MarketplaceTopicState))
    return metadata.state as MarketplaceTopicState;
  if (metadata?.featured) return "featured";
  return metadata?.listed === true ? "listed" : "unlisted";
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
