import type {
  MarketplaceContentAccess,
} from "../domain/marketplace-content-access";
import { marketplaceContentAccess } from "../domain/marketplace-content-access";
import type { MarketplaceTopicMetadataInput } from "../domain/content-v2";
import en from "../../../shared/localization/en.json";
import vi from "../../../shared/localization/vi.json";
import { StatusBadge, type StatusBadgeTone } from "../../../shared/ui/StatusBadge";

const toneByAccess: Record<MarketplaceContentAccess, StatusBadgeTone> = {
  free: "success",
  subscription: "primary",
  paid: "warning",
};

export function MarketplaceAccessBadge({
  locale,
  marketplace,
  inheritedAccess,
}: {
  locale: "en" | "vi";
  marketplace?: MarketplaceTopicMetadataInput;
  inheritedAccess?: MarketplaceContentAccess;
}) {
  const copy = (locale === "vi" ? vi : en).marketplaceManager;
  const access = marketplaceContentAccess(marketplace, inheritedAccess ?? "free");
  const label = {
    free: copy.accessFree,
    subscription: copy.accessPremium,
    paid: copy.accessExclusive,
  }[access];
  const inherited = inheritedAccess !== undefined && !marketplace?.pricing?.type;
  return (
    <StatusBadge
      tone={toneByAccess[access]}
      title={inherited ? copy.inheritedAccessDescription.replace("{access}", label) : label}
    >
      {inherited ? copy.inheritedAccess.replace("{access}", label) : label}
    </StatusBadge>
  );
}
