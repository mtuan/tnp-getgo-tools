import { useEffect, useState } from "react";
import type { AppSettings, RepositorySnapshot } from "../../../shared/domain/models";
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
  onSnapshotChange,
  onError,
}: {
  locale: AppSettings["locale"];
  value: MarketplaceTopicState;
  target: "topics" | "quizzes";
  id: string;
  topicId?: string;
  api: QuizManagerApi;
  onSnapshotChange(snapshot: RepositorySnapshot): void;
  onError(error: unknown): void;
}) {
  const [selected, setSelected] = useState(value);
  const [saving, setSaving] = useState(false);
  useEffect(() => setSelected(value), [value]);
  const change = async (next: MarketplaceTopicState) => {
    const previous = selected;
    setSelected(next);
    setSaving(true);
    try {
      onSnapshotChange(await api.setContentV2MarketplaceState(target, [id], next, topicId));
    } catch (error) {
      setSelected(previous);
      onError(error);
    } finally {
      setSaving(false);
    }
  };
  return <span className="manager-market-state-cell" onClick={(event) => event.stopPropagation()}>
    <MarketplaceStateSelect locale={locale} value={selected} disabled={saving} compact onChange={(next) => void change(next)} />
  </span>;
}
