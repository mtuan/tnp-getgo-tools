import type { FormEvent } from "react";
import type { ContentV2QuizSummary, ContentV2TopicSummary, MarketplaceSyncJobItem } from "../../../shared/domain/models";
import { marketplaceTopicState } from "../domain/marketplace-topic-state";
import { marketplaceSyncPlan } from "../domain/marketplace-sync-plan";
import type { MarketplaceSyncPlanItem } from "../domain/marketplace-sync-plan";
import * as ui from "../../../shared/ui";
import en from "../../../shared/localization/en.json";
import vi from "../../../shared/localization/vi.json";
import { marketplaceStateTone } from "../../../renderer/topic-status";
import { TopicQuizTreeIdentity } from "./TopicQuizTreeIdentity";

function syncDetail(
  template: string,
  item: MarketplaceSyncPlanItem,
): string {
  const quiz = item.kind === "quiz" ? item.quiz : undefined;
  return Object.entries({
    title: quiz?.title ?? item.topic.title,
    topicId: item.topic.id,
    quizId: quiz?.id ?? "",
    questionCount: quiz?.questionCount ?? 0,
  }).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

export function MarketplaceSyncDrawer({
  topics,
  quizzes,
  locale,
  busy,
  onClose,
  onSync,
}: {
  topics: ContentV2TopicSummary[];
  quizzes: ContentV2QuizSummary[];
  locale: "en" | "vi";
  busy: boolean;
  onClose(): void;
  onSync(items: MarketplaceSyncJobItem[]): Promise<void>;
}) {
  const copy = (locale === "vi" ? vi : en).marketplaceManager;
  const plan = marketplaceSyncPlan(topics, quizzes).filter((item) => item.ready);
  const rows: ui.TreeDataRow<MarketplaceSyncPlanItem>[] = plan
    .filter((item): item is Extract<MarketplaceSyncPlanItem, { kind: "topic" }> => item.kind === "topic")
    .map((item) => ({
      row: item,
      children: plan
        .filter((child): child is Extract<MarketplaceSyncPlanItem, { kind: "quiz" }> => child.kind === "quiz" && child.topic.id === item.topic.id)
        .map((child) => ({ row: child })),
    }));
  const columns: ui.DataColumn<(typeof plan)[number]>[] = [
    {
      key: "topic",
      title: copy.syncItem,
      width: 360,
      render: () => null,
    },
    {
      key: "state",
      title: copy.syncMarketplaceState,
      width: 110,
      align: "center",
      render: (item) => {
        const state = marketplaceTopicState(item.kind === "quiz" ? item.quiz.marketplace : item.topic.marketplace);
        return <ui.StatusBadge tone={marketplaceStateTone(state)}>{copy.states[state]}</ui.StatusBadge>;
      },
    },
    {
      key: "review",
      title: copy.syncReview,
      width: 96,
      align: "center",
      render: (item) => {
        const relevant = item.kind === "quiz"
          ? [item.quiz]
          : plan.flatMap((candidate) =>
              candidate.kind === "quiz" && candidate.topic.id === item.topic.id
                ? [candidate.quiz]
                : [],
            );
        const total = relevant.reduce((sum, quiz) => sum + quiz.questionCount, 0);
        const reviewed = relevant.reduce((sum, quiz) => sum + quiz.reviewedQuestionCount, 0);
        return <ui.StatusBadge tone={total > 0 && reviewed === total ? "success" : reviewed > 0 ? "warning" : "neutral"}>{reviewed}/{total}</ui.StatusBadge>;
      },
    },
    {
      key: "action",
      title: copy.syncAction,
      width: 824,
      render: (item) => <span className="marketplace-sync-action"><strong>{copy.syncActions[item.kind][item.action]}</strong><ul>{copy.syncDetails[item.kind][item.action].map((detail) => <li key={detail}>{syncDetail(detail, item)}</li>)}</ul></span>,
    },
  ];
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void onSync(plan.map((item) => item.kind === "quiz"
      ? { kind: "quiz", topicId: item.topic.id, quizId: item.quiz.id }
      : { kind: "topic", topicId: item.topic.id }));
  };
  return <ui.DialogFrame
    presentation="drawer"
    className="marketplace-sync-drawer"
    title={copy.syncPreviewTitle}
    busy={busy}
    error={null}
    submitLabel={copy.syncStart}
    submitColor="primary"
    submitDisabled={plan.length === 0}
    onClose={onClose}
    onSubmit={submit}
  >
    <ui.TreeDataTable
      ariaLabel={copy.syncPreviewTitle}
      columns={columns}
      rows={rows}
      rowKey={(item) => item.kind === "quiz" ? `quiz:${item.quiz.key}` : `topic:${item.topic.id}`}
      emptyText={copy.syncNothing}
      horizontalScroll
      renderIdentity={(item, _depth, toggle) => item.kind === "quiz"
        ? <TopicQuizTreeIdentity toggle={toggle} topicId={item.topic.id} reference={item.quiz.icon} title={item.quiz.title} description={item.quiz.id} kind="quiz" />
        : <TopicQuizTreeIdentity toggle={toggle} topicId={item.topic.id} reference={item.topic.icon} title={item.topic.title} description={item.topic.description || item.topic.id} kind="topic" count={plan.filter((candidate) => candidate.kind === "quiz" && candidate.topic.id === item.topic.id).length} />}
    />
  </ui.DialogFrame>;
}
