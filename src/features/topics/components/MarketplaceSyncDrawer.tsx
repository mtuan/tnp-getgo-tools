import type { FormEvent } from "react";
import type { ContentV2QuizSummary, ContentV2TopicSummary } from "../../../shared/domain/models";
import { marketplaceTopicState } from "../domain/marketplace-topic-state";
import { marketplaceSyncPlan } from "../domain/marketplace-sync-plan";
import type { MarketplaceSyncPlanItem } from "../domain/marketplace-sync-plan";
import * as ui from "../../../shared/ui";
import en from "../../../shared/localization/en.json";
import vi from "../../../shared/localization/vi.json";
import { marketplaceStateTone } from "../../../renderer/topic-status";

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
  onSync(): Promise<void>;
}) {
  const copy = (locale === "vi" ? vi : en).marketplaceManager;
  const plan = marketplaceSyncPlan(topics, quizzes);
  const blocked = plan.filter((item) => !item.ready).length;
  const ready = plan.length - blocked;
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
      width: "32%",
      render: (item) => <span className="marketplace-sync-topic"><strong>{item.kind === "quiz" ? item.quiz.title : item.topic.title}</strong><small>{item.kind === "quiz" ? `${copy.syncQuiz} · ${item.quiz.id}` : `${copy.syncTopic} · ${item.topic.id}`}</small></span>,
    },
    {
      key: "state",
      title: copy.syncMarketplaceState,
      width: "16%",
      render: (item) => {
        const state = marketplaceTopicState(item.kind === "quiz" ? item.quiz.marketplace : item.topic.marketplace);
        return <ui.StatusBadge tone={marketplaceStateTone(state)}>{copy.states[state]}</ui.StatusBadge>;
      },
    },
    {
      key: "action",
      title: copy.syncAction,
      width: "38%",
      render: (item) => <span className="marketplace-sync-action"><strong>{copy.syncActions[item.action]}</strong><small>{copy.syncDetails[item.kind][item.action]}</small></span>,
    },
    {
      key: "readiness",
      title: copy.syncReadiness,
      width: "14%",
      align: "center",
      render: (item) => item.ready
        ? <ui.StatusBadge tone="success">{copy.syncIncluded}</ui.StatusBadge>
        : <span className="marketplace-sync-readiness"><ui.StatusBadge tone="warning">{copy.syncNotIncluded}</ui.StatusBadge><small>{item.kind === "quiz" ? `${item.quiz.reviewedQuestionCount}/${item.quiz.questionCount}` : ""}</small></span>,
    },
  ];
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void onSync();
  };
  return <ui.DialogFrame
    presentation="drawer"
    className="marketplace-sync-drawer"
    title={copy.syncPreviewTitle}
    busy={busy}
    error={null}
    submitLabel={copy.syncStart}
    submitColor="primary"
    submitDisabled={ready === 0}
    onClose={onClose}
    onSubmit={submit}
  >
    <div className="marketplace-sync-summary">
      <strong>{copy.syncPreviewCount.replace("{count}", String(ready))}</strong>
      <span>{blocked ? copy.syncBlocked.replace("{count}", String(blocked)) : copy.syncPreviewDescription}</span>
    </div>
    <div className="marketplace-sync-definitions">
      <div><strong>{copy.syncMarketplaceState}</strong><span>{copy.syncMarketplaceStateDescription}</span></div>
      <div><strong>{copy.syncReadiness}</strong><span>{copy.syncReadinessDescription}</span></div>
    </div>
    <ui.TreeDataTable
      ariaLabel={copy.syncPreviewTitle}
      columns={columns}
      rows={rows}
      rowKey={(item) => item.kind === "quiz" ? `quiz:${item.quiz.key}` : `topic:${item.topic.id}`}
      emptyText={copy.syncNothing}
      horizontalScroll
      defaultExpandedKeys={rows.map((item) => `topic:${item.row.topic.id}`)}
      renderIdentity={(item, _depth, toggle) => <span className="marketplace-sync-tree-identity">{toggle}<span className="marketplace-sync-topic"><strong>{item.kind === "quiz" ? item.quiz.title : item.topic.title}</strong><small>{item.kind === "quiz" ? `${copy.syncQuiz} · ${item.quiz.id}` : `${copy.syncTopic} · ${item.topic.id}`}</small></span></span>}
    />
  </ui.DialogFrame>;
}
