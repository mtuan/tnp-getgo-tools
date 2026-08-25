import { useEffect, useState } from "react";
import { CheckCheck } from "lucide-react";
import type { AppSettings } from "../../../shared/domain/models";
import type { MarketplaceTopicState } from "../domain/marketplace-topic-state";
import type { QuizManagerApi } from "../pages/quiz-manager/shared";
import { MarketplaceStateSelect } from "./MarketplaceStateSelect";
import { Button } from "../../../shared/ui/Button";
import { DialogFrame } from "../../../shared/ui/DialogFrame";
import en from "../../../shared/localization/en.json";
import vi from "../../../shared/localization/vi.json";

export function MarketplaceStateCell({
  locale,
  value,
  target,
  id,
  topicId,
  api,
  onSaved,
  onError,
  quizReview,
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
  quizReview?: { manifestPath: string; reviewed: number; total: number };
  compact?: boolean;
}) {
  const [selected, setSelected] = useState(value);
  const [saving, setSaving] = useState(false);
  const [confirmingReview, setConfirmingReview] = useState(false);
  const [confirmationError, setConfirmationError] = useState<string | null>(null);
  useEffect(() => setSelected(value), [value]);
  const applyChange = async (next: MarketplaceTopicState, reviewRemaining = false) => {
    if (next === selected || saving) return;
    const previous = selected;
    setSelected(next);
    setSaving(true);
    setConfirmationError(null);
    try {
      if (reviewRemaining && quizReview)
        await api.markAllQuizQuestionsReviewed(quizReview.manifestPath);
      await api.setContentV2MarketplaceState(target, [id], next, topicId);
      if (target === "quizzes" && topicId) await api.loadTopicQuizzes?.(topicId);
      setConfirmingReview(false);
      onSaved(next);
    } catch (error) {
      setSelected(previous);
      if (confirmingReview)
        setConfirmationError(error instanceof Error ? error.message : String(error));
      onError(error);
    } finally {
      setSaving(false);
    }
  };
  const change = (next: MarketplaceTopicState) => {
    if (next === selected || saving) return;
    if (
      target === "quizzes" &&
      next === "listed" &&
      quizReview &&
      quizReview.reviewed < quizReview.total
    ) {
      setConfirmationError(null);
      setConfirmingReview(true);
      return;
    }
    void applyChange(next);
  };
  const remaining = quizReview
    ? Math.max(0, quizReview.total - quizReview.reviewed)
    : 0;
  const copy = (locale === "vi" ? vi : en).marketplaceManager;
  const reviewCopy = copy.reviewBeforeListing;
  return <>
    <span className={`manager-market-state-cell${compact ? " compact" : ""}`} onClick={(event) => event.stopPropagation()}>
      <MarketplaceStateSelect locale={locale} value={selected} disabled={saving} compact={compact} onChange={change} />
    </span>
    {confirmingReview && <DialogFrame
      presentation="modal"
      className="quiz-review-confirmation-dialog"
      hideFooter
      title={reviewCopy.title}
      busy={saving}
      error={confirmationError}
      onClose={() => { if (!saving) setConfirmingReview(false); }}
      onSubmit={(event) => event.preventDefault()}
    >
      <div className="logout-confirmation">
        <i><CheckCheck /></i>
        <div>
          <strong>{(remaining === 1 ? reviewCopy.countOne : reviewCopy.countMany).replace("{count}", String(remaining))}</strong>
          <span>{reviewCopy.description}</span>
        </div>
      </div>
      <div className="logout-actions">
        <Button disabled={saving} onClick={() => setConfirmingReview(false)}>{copy.cancel}</Button>
        <Button disabled={saving} variant="solid" color="warning" onClick={() => void applyChange("listed")}>{reviewCopy.listWithoutReviewing}</Button>
        <Button icon={<CheckCheck />} loading={saving} variant="solid" onClick={() => void applyChange("listed", true)}>{reviewCopy.markAndList}</Button>
      </div>
    </DialogFrame>}
  </>;
}
