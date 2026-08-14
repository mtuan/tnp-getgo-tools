import { useEffect, useState } from "react";
import type { AppSettings } from "../../../shared/domain/models";
import type { MarketplaceTopicState } from "../domain/marketplace-topic-state";
import type { QuizManagerApi } from "../pages/quiz-manager/shared";
import { MarketplaceStateSelect } from "./MarketplaceStateSelect";

export function MarketplaceStateCell({
  locale,
  value,
  target,
  id,
  topicId,
  api,
  onSaved,
  onError,
  compact = true,
}: {
  locale: AppSettings["locale"];
  value: MarketplaceTopicState;
  target: "topics" | "quizzes";
  id: string;
  topicId?: string;
  api: QuizManagerApi;
  onSaved(value: MarketplaceTopicState): void;
  onError(error: unknown): void;
  compact?: boolean;
}) {
  const [selected, setSelected] = useState(value);
  const [saving, setSaving] = useState(false);
  useEffect(() => setSelected(value), [value]);
  const change = async (next: MarketplaceTopicState) => {
    if (next === selected || saving) return;
    const previous = selected;
    setSelected(next);
    setSaving(true);
    try {
      await api.setContentV2MarketplaceState(target, [id], next, topicId);
      onSaved(next);
    } catch (error) {
      setSelected(previous);
      onError(error);
    } finally {
      setSaving(false);
    }
  };
  return <span className="manager-market-state-cell" onClick={(event) => event.stopPropagation()}>
    <MarketplaceStateSelect locale={locale} value={selected} disabled={saving} compact={compact} onChange={(next) => void change(next)} />
  </span>;
}
