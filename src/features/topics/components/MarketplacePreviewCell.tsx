import { useEffect, useState } from "react";
import type { AppSettings } from "../../../shared/domain/models";
import * as ui from "../../../shared/ui";
import type { QuizManagerApi } from "../pages/quiz-manager/shared";
import en from "../../../shared/localization/en.json";
import vi from "../../../shared/localization/vi.json";

export function MarketplacePreviewCell({
  locale,
  value,
  target,
  id,
  topicId,
  api,
  onSaved,
  onError,
}: {
  locale: AppSettings["locale"];
  value: boolean;
  target: "topics" | "quizzes";
  id: string;
  topicId?: string;
  api: QuizManagerApi;
  onSaved(value: boolean): void;
  onError(error: unknown): void;
}) {
  const [selected, setSelected] = useState(value);
  const [saving, setSaving] = useState(false);
  const copy = (locale === "vi" ? vi : en).marketplaceManager;

  useEffect(() => setSelected(value), [value]);

  const change = async (next: boolean) => {
    if (next === selected || saving) return;
    const previous = selected;
    setSelected(next);
    setSaving(true);
    try {
      if (target === "topics") {
        const topic = await api.loadContentV2Topic(id);
        await api.saveContentV2Topic({
          ...topic,
          marketplace: { ...topic.marketplace, preview: next },
        });
      } else {
        if (!topicId) throw new Error(copy.previewMissingTopic);
        const quiz = await api.loadContentV2Quiz(topicId, id);
        await api.saveContentV2Quiz(topicId, {
          ...quiz,
          marketplace: { ...quiz.marketplace, preview: next },
        });
      }
      onSaved(next);
    } catch (error) {
      setSelected(previous);
      onError(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <span className="manager-preview-cell" onClick={(event) => event.stopPropagation()}>
      <ui.Toggle
        checked={selected}
        disabled={saving}
        ariaLabel={copy.fields.preview}
        onCheckedChange={(next) => void change(next)}
      />
    </span>
  );
}
