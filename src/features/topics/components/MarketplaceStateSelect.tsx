import type { MarketplaceTopicState } from "../domain/marketplace-topic-state";
import * as ui from "../../../shared/ui";
import en from "../../../shared/localization/en.json";
import vi from "../../../shared/localization/vi.json";

export function MarketplaceStateSelect({
  locale,
  value,
  disabled,
  onChange,
}: {
  locale: "en" | "vi";
  value: MarketplaceTopicState;
  disabled?: boolean;
  onChange(value: MarketplaceTopicState): void;
}) {
  const copy = (locale === "vi" ? vi : en).marketplaceManager;
  return <ui.Select
    className="manager-market-state-select"
    ariaLabel={copy.stateLabel}
    value={value}
    disabled={disabled}
    options={Object.entries(copy.states).map(([state, label]) => ({ state, label, value: state }))}
    onValueChange={(state) => onChange(state as MarketplaceTopicState)}
  />;
}
