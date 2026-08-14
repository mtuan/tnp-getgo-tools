import type { ContestSummary, QuizSummary, RepositorySnapshot } from "../../../../shared/domain/models";
import { TreeDataTable, type TreeDataRow } from "../../../../shared/ui/TreeDataTable";
import type { DataColumn } from "../../../../shared/ui/DataTable";
import { StatusBadge, type StatusBadgeTone } from "../../../../shared/ui/StatusBadge";
import { marketplaceStateLabel, quizMarketplaceStatus, topicMarketplaceSyncStatus } from "../../../../renderer/topic-status";
import { contentV2QuizReviewStatus } from "./shared";
import { TopicQuizTreeIdentity } from "../../components/TopicQuizTreeIdentity";
import { MarketplaceStateCell } from "../../components/MarketplaceStateCell";
import en from "../../../../shared/localization/en.json";
import vi from "../../../../shared/localization/vi.json";

type ContestWithQuizzes = ContestSummary & { quizzes: QuizSummary[] };
type TopicTreeContext = Record<string, any> & {
  snapshot: RepositorySnapshot;
  visibleContests: ContestWithQuizzes[];
  treeTopicQuizzes: Record<string, QuizSummary[]>;
};

export function renderTopicTree(context: TopicTreeContext) {
  const {
isContest,
    loadTreeTopicQuizzes,
    locale,
    managerApi,
    openQuiz,
    onSnapshotChange,
    setContestTab,
    setPage,
    snapshot,
    topicMode,
    topicsView,
    toast,
    treeTopicQuizzes,
    visibleContests
  } = context;
  const marketplaceCopy = (locale === "vi" ? vi : en).marketplaceManager;
  return (
    <>
          {!isContest && topicMode && (
            <div hidden={topicsView !== "tree"}>
              {(() => {
              type TopicTreeRow =
                | {
                    kind: "topic";
                    contest: (typeof visibleContests)[number];
                    summary: NonNullable<
                      (typeof snapshot.contentV2.topics)[number]
                    >;
                  }
                | { kind: "quiz"; quiz: QuizSummary };
              const rows: TreeDataRow<TopicTreeRow>[] = visibleContests.flatMap(
                (contest) => {
                  const summary = snapshot.contentV2.topics.find(
                    (topic) => topic.id === contest.id,
                  );
                  return summary
                    ? [
                        {
                          row: { kind: "topic" as const, contest, summary },
                          hasChildren: summary.quizCount > 0,
                          ...(treeTopicQuizzes[contest.id]
                            ? {
                                children: snapshot.quizzes.filter(
                                  (quiz) => quiz.contest === contest.id,
                                ).map(
                                  (quiz) => ({
                                    row: { kind: "quiz" as const, quiz },
                                  }),
                                ),
                              }
                            : {}),
                        },
                      ]
                    : [];
                },
              );
              const columns: DataColumn<TopicTreeRow>[] = [
                {
                  key: "identity",
                  title: "Topic / quiz",
                  width: "calc(100% - 492px)",
                  render: () => null,
                },
                {
                  key: "type",
                  title: "Type",
                  width: 100,
                  align: "center",
                  render: (row) => (row.kind === "topic" ? "Topic" : "Quiz"),
                },
                {
                  key: "publish",
                  title: "Review",
                  width: 136,
                  align: "center",
                  render: (row) => {
                    const review = row.kind === "topic"
                      ? (() => {
                          const questions = snapshot.contentV2.questions.filter((question) => question.topicId === row.summary.id);
                          const reviewed = questions.filter((question) => question.status === "reviewed").length;
                          return { kind: questions.length > 0 && reviewed === questions.length ? "current" : reviewed > 0 ? "changed" : "none", label: `${reviewed}/${questions.length}` };
                        })()
                      : (() => { const value = contentV2QuizReviewStatus(snapshot, row.quiz); return { kind: value.kind === "full" ? "current" : value.kind === "partial" ? "changed" : "none", label: value.label }; })();
                    const tone: StatusBadgeTone =
                      review.kind === "current"
                        ? "success"
                        : review.kind === "changed"
                          ? "warning"
                          : "neutral";
                    return (
                      <StatusBadge
                        tone={tone}
                      >
                        {review.label}
                      </StatusBadge>
                    );
                  },
                },
                {
                  key: "state",
                  title: "State",
                  width: 112,
                  align: "center",
                  className: "manager-status-cell manager-market-state-table-cell",
                  render: (row) => {
                    const metadata = row.kind === "topic" ? row.summary.marketplace : row.quiz.marketplace;
                    const state = marketplaceStateLabel(metadata).state;
                    return <MarketplaceStateCell locale={locale} value={state} target={row.kind === "topic" ? "topics" : "quizzes"} id={row.kind === "topic" ? row.summary.id : row.quiz.id} topicId={row.kind === "quiz" ? row.quiz.contest : undefined} api={managerApi} onSnapshotChange={onSnapshotChange} onError={(error) => toast.show({ title: marketplaceCopy.publishFailed, description: String(error), variant: "error" })} />;
                  },
                },
                {
                  key: "sync",
                  title: "Sync status",
                  width: 144,
                  align: "center",
                  render: (row) => {
                    const status = row.kind === "quiz"
                      ? quizMarketplaceStatus(row.quiz)
                      : topicMarketplaceSyncStatus(row.summary);
                    const tone: StatusBadgeTone =
                      status.kind === "current"
                        ? "success"
                        : status.kind === "changed"
                          ? "warning"
                          : "neutral";
                    return (
                      <StatusBadge
                        tone={tone}
                      >
                        {status.label}
                      </StatusBadge>
                    );
                  },
                },
              ];
              return (
                <TreeDataTable
                  rows={rows}
                  columns={columns}
                  rowKey={(row) =>
                    row.kind === "topic"
                      ? `topic:${row.contest.id}`
                      : `quiz:${row.quiz.key}`
                  }
                  ariaLabel="Topics and quizzes"
                  emptyText="No matching topics."
                  singleExpand
                  onRowClick={(row) => {
                    if (row.kind === "topic") {
                      setPage({ kind: "contest", contest: row.contest.id });
                      setContestTab("quizzes");
                    } else {
                      openQuiz(row.quiz);
                    }
                  }}
                  onExpand={(row) =>
                    row.kind === "topic"
                      ? loadTreeTopicQuizzes(row.contest.id)
                      : undefined
                  }
                  renderIdentity={(row, _depth, toggle) => row.kind === "topic"
                    ? <TopicQuizTreeIdentity toggle={toggle} topicId={row.contest.id} reference={row.contest.settings.book.icon} title={row.contest.title} description={row.contest.description || row.contest.id} kind="topic" count={row.summary.quizCount} />
                    : <TopicQuizTreeIdentity toggle={toggle} topicId={row.quiz.contest} reference={row.quiz.icon} title={row.quiz.title} description={row.quiz.id} kind="quiz" />}
                />
              );
              })()}
            </div>
          )}
    </>
  );
}
