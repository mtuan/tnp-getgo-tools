import type { ContestSummary, QuizSummary, RepositorySnapshot } from "../../core/models";
import { TreeDataTable, type TreeDataRow } from "../ui/TreeDataTable";
import type { DataColumn } from "../ui/DataTable";
import { StatusBadge, type StatusBadgeTone } from "../ui/StatusBadge";
import { marketplaceStateLabel, marketplaceStateTone, quizMarketplaceStatus, topicMarketplaceSyncStatus } from "../topic-status";
import { ManagerListIcon, quizReviewStatus } from "./shared";
import en from "../locales/en.json";
import vi from "../locales/vi.json";

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
    setContestTab,
    setPage,
    setQuizTab,
    snapshot,
    topicMode,
    topicsView,
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
                      ? { kind: row.summary.status === "reviewed" ? "current" : row.summary.status === "rejected" ? "changed" : "none", label: row.summary.status === "reviewed" ? "Ready" : row.summary.status === "rejected" ? "Rejected" : "Needs review" }
                      : (() => { const value = quizReviewStatus(row.quiz); return { kind: value.kind === "full" ? "current" : value.kind === "partial" ? "changed" : "none", label: `${value.reviewed}/${value.total}` }; })();
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
                  render: (row) => {
                    const metadata = row.kind === "topic" ? row.summary.marketplace : row.quiz.marketplace;
                    const state = marketplaceStateLabel(metadata).state;
                    return <StatusBadge tone={marketplaceStateTone(state)}>{marketplaceCopy.states[state]}</StatusBadge>;
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
                      setContestTab("info");
                    } else {
                      setPage({ kind: "quiz", quiz: row.quiz });
                      setQuizTab("info");
                    }
                  }}
                  onExpand={(row) =>
                    row.kind === "topic"
                      ? loadTreeTopicQuizzes(row.contest.id)
                      : undefined
                  }
                  renderIdentity={(row, _depth, toggle) => (
                    <div className="topics-tree-identity">
                      {toggle}
                      {row.kind === "topic" ? (
                        <>
                          <ManagerListIcon
                            topicId={row.contest.id}
                            reference={row.contest.settings.book.icon}
                            label={row.contest.title}
                            kind="topic"
                          />
                          <div>
                            <strong>{row.contest.title}</strong>
                            <span>
                              {row.contest.description || row.contest.id}
                            </span>
                          </div>
                        </>
                      ) : (
                        <>
                          <ManagerListIcon
                            topicId={row.quiz.contest}
                            reference={row.quiz.icon}
                            label={row.quiz.title}
                            kind="quiz"
                          />
                          <div>
                            <strong>{row.quiz.title}</strong>
                            <span>{row.quiz.id}</span>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                />
              );
              })()}
            </div>
          )}
    </>
  );
}
