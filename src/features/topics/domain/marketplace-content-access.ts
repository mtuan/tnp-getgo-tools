import type { MarketplaceTopicMetadataInput } from "./content-v2.js";

export type MarketplaceContentAccess = "free" | "subscription" | "paid";

export function marketplaceContentAccess(
  metadata: MarketplaceTopicMetadataInput | undefined,
  inherited: MarketplaceContentAccess = "free",
): MarketplaceContentAccess {
  const type = metadata?.pricing?.type;
  return type === "free" || type === "subscription" || type === "paid"
    ? type
    : inherited;
}
