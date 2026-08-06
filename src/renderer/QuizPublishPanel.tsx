import type { AppSettings, QuizSummary } from "../core/models";
import en from "./locales/en.json";
import vi from "./locales/vi.json";
import { SummaryCard } from "./ui/SummaryCard";

type LocalPublishStatus =
  "local-error" | "not-published" | "changed" | "up-to-date";

interface Props {
  quiz: QuizSummary;
  locale: AppSettings["locale"];
}

export function QuizPublishPanel({ quiz, locale }: Props) {
  const copy = (locale === "vi" ? vi : en).quizPublish;
  const status: LocalPublishStatus = !quiz.localContentHash
    ? "local-error"
    : !quiz.publishedHash
      ? "not-published"
      : quiz.localContentHash === quiz.publishedHash
        ? "up-to-date"
        : "changed";
  const statusLabels: Record<LocalPublishStatus, string> = {
    "local-error": copy.unavailable,
    "not-published": copy.notPublished,
    changed: copy.republishNeeded,
    "up-to-date": copy.published,
  };
  const lastPublished = quiz.publishedAt
    ? new Date(quiz.publishedAt).toLocaleString(locale)
    : copy.never;

  return (
    <section className="quiz-publish-page">
      <header className="quiz-publish-heading">
        <div>
          <h2>{copy.title}</h2>
          <p>{copy.description}</p>
        </div>
        <span className={`badge publishing-status publishing-status-${status}`}>
          {statusLabels[status]}
        </span>
      </header>
      <div className="quiz-publish-summary">
        <SummaryCard
          label={copy.status}
          value={statusLabels[status]}
          detail={
            status === "changed"
              ? copy.changedDescription
              : status === "up-to-date"
                ? copy.currentDescription
                : undefined
          }
        />
        <SummaryCard label={copy.lastPublished} value={lastPublished} />
        <SummaryCard label={copy.questions} value={quiz.questionCount ?? "—"} />
      </div>
      <dl className="quiz-publish-details">
        <div>
          <dt>{copy.publishedHash}</dt>
          <dd>
            <code>{quiz.publishedHash || copy.none}</code>
          </dd>
        </div>
        <div>
          <dt>{copy.currentHash}</dt>
          <dd>
            <code>{quiz.localContentHash || copy.unavailable}</code>
          </dd>
        </div>
      </dl>
    </section>
  );
}
