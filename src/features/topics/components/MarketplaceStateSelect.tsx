import type { MarketplaceTopicState } from "../domain/marketplace-topic-state";
import * as ui from "../../../shared/ui";
import en from "../../../shared/localization/en.json";
import vi from "../../../shared/localization/vi.json";
import { marketplaceStateTone } from "../../../renderer/topic-status";

export function MarketplaceStateSelect({
  locale,
  value,
  disabled,
  onChange,
  compact = false,
}: {
  locale: "en" | "vi";
  value: MarketplaceTopicState;
  disabled?: boolean;
  onChange(value: MarketplaceTopicState): void;
  compact?: boolean;
}) {
  const copy = (locale === "vi" ? vi : en).marketplaceManager;
  const tone = marketplaceStateTone(value);
  return <ui.Select
    className={`manager-market-state-select${compact ? " compact" : ""}`}
    ariaLabel={copy.stateLabel}
    value={value}
    disabled={disabled}
    color={tone === "info" ? "normal" : tone}
    options={Object.entries(copy.states).map(([state, label]) => ({ state, label, value: state }))}
    onValueChange={(state) => onChange(state as MarketplaceTopicState)}
  />;
}
