import type { ContestSummary, QuizSummary, RepositorySnapshot } from "../../../../shared/domain/models";
import { TreeDataTable, type TreeDataRow } from "../../../../shared/ui/TreeDataTable";
import type { DataColumn } from "../../../../shared/ui/DataTable";
import { StatusBadge, type StatusBadgeTone } from "../../../../shared/ui/StatusBadge";
import { marketplaceStateLabel, marketplaceStateTone, quizMarketplaceStatus, topicMarketplaceSyncStatus } from "../../../../renderer/topic-status";
import { ManagerListIcon, quizReviewStatus } from "./shared";
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
    openQuiz,
    setContestTab,
    setPage,
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
                      ? (() => {
                          const questions = snapshot.contentV2.questions.filter((question) => question.topicId === row.summary.id);
                          const reviewed = questions.filter((question) => question.status === "reviewed").length;
                          return { kind: questions.length > 0 && reviewed === questions.length ? "current" : reviewed > 0 ? "changed" : "none", label: `${reviewed}/${questions.length}` };
                        })()
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
