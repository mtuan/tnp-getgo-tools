import { CloudUpload, Pencil } from "lucide-react";
import type { ContestSummary, QuizSummary, RepositorySnapshot } from "../../core/models";
import { TreeDataTable, type TreeDataRow } from "../ui/TreeDataTable";
import type { DataColumn } from "../ui/DataTable";
import { StatusBadge, type StatusBadgeTone } from "../ui/StatusBadge";
import { ActionMenu } from "../ui/ActionMenu";
import { TableActionButton } from "../ui/TableActionButton";
import { topicMarketplaceStatus } from "../topic-status";
import { ManagerListIcon, quizReviewStatus } from "./shared";

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
    managerApi,
    onOpenJobs,
    onSnapshotChange,
    runButtonAction,
    setContestTab,
    setPage,
    setQuizTab,
    snapshot,
    toast,
    topicMode,
    topicsView,
    treeTopicQuizzes,
    visibleContests
  } = context;
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
                                children: treeTopicQuizzes[contest.id].map(
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
                  width: "calc(100% - 484px)",
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
                        ariaLabel={`Open ${row.kind} review`}
                        onClick={() => {
                          if (row.kind === "topic") {
                            setPage({
                              kind: "contest",
                              contest: row.contest.id,
                            });
                            setContestTab("info");
                          } else {
                            setPage({ kind: "quiz", quiz: row.quiz });
                            setQuizTab(row.quiz.type === "contest" ? "questions" : "alphabets");
                          }
                        }}
                      >
                        {review.label}
                      </StatusBadge>
                    );
                  },
                },
                {
                  key: "market",
                  title: "Market sync",
                  width: 144,
                  align: "center",
                  render: (row) => {
                    if (row.kind === "quiz") {
                      const review = quizReviewStatus(row.quiz);
                      const included = review.kind === "full";
                      return (
                        <StatusBadge tone={included ? "success" : "neutral"}>
                          {included ? "Included" : "Not ready"}
                        </StatusBadge>
                      );
                    }
                    const status = topicMarketplaceStatus(row.summary);
                    const tone: StatusBadgeTone =
                      status.kind === "current"
                        ? "success"
                        : status.kind === "changed"
                          ? "warning"
                          : "neutral";
                    return (
                      <StatusBadge
                        tone={tone}
                        ariaLabel="Open topic marketplace tab"
                        onClick={() => {
                          setPage({ kind: "contest", contest: row.contest.id });
                          setContestTab("info");
                        }}
                      >
                        {status.label}
                      </StatusBadge>
                    );
                  },
                },
                {
                  key: "action",
                  title: "",
                  width: 104,
                  align: "right",
                  role: "actions",
                  render: (row) => (
                    <div className="manager-row-actions">
                      {row.kind === "topic" && <TableActionButton
                          color="primary"
                          icon={<Pencil />}
                          aria-label="Edit topic"
                          title="Edit topic"
                          onClick={(event) => {
                            event.stopPropagation();
                            setPage({
                              kind: "contest",
                              contest: row.contest.id,
                            });
                            setContestTab("info");
                          }}
                        />}
                      {row.kind === "topic" && <ActionMenu
                        label="More actions"
                        iconOnly
                        items={[
                          {
                            id: "publish-market",
                            label: "Publish to Market",
                            icon: CloudUpload,
                            onSelect: () =>
                              void runButtonAction(
                                "quick-publish-market",
                                async () => {
                                  const result = await managerApi.publishContentV2Topic(row.contest.id);
                                  if (result.snapshot) onSnapshotChange(result.snapshot);
                                  onOpenJobs();
                                  toast.show({
                                    title: "Publish to Market started",
                                    description: `Synchronizing ${row.contest.title} content and marketplace listing.`,
                                  });
                                },
                              ),
                          },
                        ]}
                      />}
                    </div>
                  ),
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
                  toggleParentOnRowClick
                  singleExpand
                  onRowClick={(row) => {
                    if (row.kind !== "quiz") return;
                    setPage({ kind: "quiz", quiz: row.quiz });
                    setQuizTab("info");
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
