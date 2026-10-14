import type { FormEvent } from "react";
import type { ContentV2QuizSummary, ContentV2TopicSummary } from "../../../shared/domain/models";
import * as ui from "../../../shared/ui";
import en from "../../../shared/localization/en.json";
import vi from "../../../shared/localization/vi.json";
import { marketplaceAccessPlan } from "../domain/marketplace-access-plan";

type PlanRow = {
  topic: ContentV2TopicSummary;
  quizCount: number;
  previewCount: number;
  freeCount: number;
  inheritedCount: number;
};

export function MarketplaceAccessManager({ topics, quizzes, locale, busy, error, onClose, onApply }: {
  topics: ContentV2TopicSummary[];
  quizzes: ContentV2QuizSummary[];
  locale: "en" | "vi";
  busy: boolean;
  error: string | null;
  onClose(): void;
  onApply(): Promise<void>;
}) {
  const copy = (locale === "vi" ? vi : en).marketplaceManager.accessManager;
  const rows: PlanRow[] = topics
    .filter(topic => topic.marketplace?.experimental !== true)
    .map(topic => {
      const topicQuizzes = quizzes.filter(quiz => quiz.topicId === topic.id);
      const plan = marketplaceAccessPlan(topicQuizzes);
      return {
        topic,
        quizCount: topicQuizzes.length,
        previewCount: plan.previewIds.length,
        freeCount: plan.freeIds.length,
        inheritedCount: plan.inheritedIds.length,
      };
    });
  const columns: ui.DataColumn<PlanRow>[] = [
    { key: "topic", title: copy.topic, width: "52%", render: row => <span><strong>{row.topic.title}</strong><small className="ui-table-secondary">{row.topic.id}</small></span> },
    { key: "quizzes", title: copy.quizzes, width: "12%", align: "center", render: row => row.quizCount },
    { key: "preview", title: copy.preview, width: "12%", align: "center", render: row => row.previewCount },
    { key: "free", title: copy.free, width: "12%", align: "center", render: row => row.freeCount },
    { key: "inherited", title: copy.inherited, width: "12%", align: "center", render: row => row.inheritedCount },
  ];
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void onApply();
  };
  return <ui.DialogFrame
    presentation="drawer"
    className="marketplace-access-manager"
    title={copy.title}
    busy={busy}
    error={error}
    cancelLabel={copy.cancel}
    submitLabel={copy.apply}
    submitColor="primary"
    submitDisabled={rows.length === 0}
    onClose={onClose}
    onSubmit={submit}
  >
    <div className="marketplace-access-manager-copy">
      <p>{copy.description.replace("{count}", String(rows.length))}</p>
      <ul>
        <li>{copy.premiumRule}</li>
        <li>{copy.previewRule}</li>
        <li>{copy.freeRule}</li>
        <li>{copy.localOnly}</li>
      </ul>
    </div>
    <ui.DataTable
      rows={rows}
      columns={columns}
      rowKey={row => row.topic.id}
      ariaLabel={copy.title}
      emptyText={copy.empty}
    />
  </ui.DialogFrame>;
}
