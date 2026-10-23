import { Sparkles } from "lucide-react";
import type { AppSettings } from "../../../shared/domain/models";
import en from "../../../shared/localization/en.json";
import vi from "../../../shared/localization/vi.json";

export function AiGeneratedIndicator({
  locale,
  kind = "question",
}: {
  locale: AppSettings["locale"];
  kind?: "quiz" | "question";
}) {
  const copy = (locale === "vi" ? vi : en).aiGenerated;
  const label = kind === "quiz" ? copy.quizTitle : copy.questionTitle;
  return (
    <span className="ai-generated-indicator" title={label} aria-label={label} role="img">
      <Sparkles className="ai-generated-indicator-icon" aria-hidden="true" />
    </span>
  );
}
