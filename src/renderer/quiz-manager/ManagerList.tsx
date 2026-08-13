import { ChevronRight, CloudUpload, ListOrdered, Pencil, Search, Rows3 } from "lucide-react";
import type { ContestSummary, QuizSummary, RepositorySnapshot } from "../../core/models";
import { Button } from "../ui/Button";
import { StatusBadge } from "../ui/StatusBadge";
import { ActionMenu } from "../ui/ActionMenu";
import { TableActionButton } from "../ui/TableActionButton";
import { topicMarketplaceStatus } from "../topic-status";
import { ManagerListIcon, quizReviewStatus } from "./shared";
import { renderTopicTree } from "./TopicTree";

type ContestWithQuizzes = ContestSummary & { quizzes: QuizSummary[] };
type ManagerListContext = Record<string, any> & {
  snapshot: RepositorySnapshot;
  visibleContests: ContestWithQuizzes[];
  visibleQuizzes: QuizSummary[];
};

export function renderManagerList(context: ManagerListContext) {
  const {
    contestTab,
    isContest,
    managerApi,
    migrationForQuiz,
    onOpenJobs,
    onSnapshotChange,
    query,
    runButtonAction,
    setContestTab,
    setPage,
    setQuery,
    setQuizTab,
    setTopicsView,
    snapshot,
    toast,
    topicMode,
    topicsView,
    visibleContests,
    visibleQuizzes,
  } = context;
  return (
    <>
      {(!isContest || contestTab === "quizzes") && (
        <>
          <div className="manager-list-toolbar">
            <div className="manager-search">
              <Search size={17} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={
                  isContest
                    ? "Search quizzes…"
                    : `Search ${topicMode ? "topics" : "contests"}…`
                }
              />
            </div>
            {!isContest && topicMode && (
              <Button
                className="manager-view-switcher"
                variant="icon"
                icon={topicsView === "tree" ? <Rows3 /> : <ListOrdered />}
                aria-label={
                  topicsView === "tree" ? "Show list view" : "Show tree view"
                }
                title={
                  topicsView === "tree" ? "Show list view" : "Show tree view"
                }
                onClick={() => {
                  const next = topicsView === "tree" ? "list" : "tree";
                  setTopicsView(next);
                  try {
                    localStorage.setItem("getgo-tools.topics-view", next);
                  } catch {
                    /* Storage is optional. */
                  }
                }}
              />
            )}
          </div>
          {renderTopicTree(context as any)}
          <div
            className="manager-table"
            hidden={!isContest && topicMode && topicsView === "tree"}
          >
              <table>
                {topicMode && (
                  <colgroup>
                    <col />
                    <col style={{ width: 100 }} />
                    <col style={{ width: 136 }} />
                    <col style={{ width: 144 }} />
                    <col style={{ width: 104 }} />
                  </colgroup>
                )}
                <thead>
                  <tr>
                    {topicMode && isContest ? (
                      <>
                        <th>Quiz</th>
                        <th className="manager-column-centered">Type</th>
                        <th className="manager-column-centered">Review</th>
                        <th className="manager-column-centered">Market sync</th>
                        <th />
                      </>
                    ) : isContest ? (
                      <>
                        <th>Quiz</th>
                        <th>Version</th>
                        <th>Grade</th>
                        <th>Year / round</th>
                        <th>Questions</th>
                        <th>Reviewed</th>
                        <th>Status</th>
                        <th />
                      </>
                    ) : (
                      <>
                        <th>{topicMode ? "Topic" : "Contest"}</th>
                        <th
                          className={
                            topicMode ? "manager-column-centered" : undefined
                          }
                        >
                          {topicMode ? "Type" : "Quizzes"}
                        </th>
                        {topicMode ? (
                          <>
                            <th className="manager-column-centered">Review</th>
                            <th className="manager-column-centered">
                              Market sync
                            </th>
                          </>
                        ) : (
                          <>
                            <th>Ready</th>
                            <th>Builds</th>
                          </>
                        )}
                        <th />
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {topicMode && isContest
                    ? visibleQuizzes.map((quiz) => {
                        const review = quizReviewStatus(quiz);
                        return (
                          <tr
                            key={quiz.key}
                            onClick={() => {
                              setPage({ kind: "quiz", quiz });
                              setQuizTab("info");
                            }}
                          >
                            <td>
                              <div className="manager-list-identity">
                                <ManagerListIcon
                                  topicId={quiz.contest}
                                  reference={quiz.icon}
                                  label={quiz.title}
                                  kind="quiz"
                                />
                                <div>
                                  <strong>{quiz.title}</strong>
                                  <span>{quiz.id}</span>
                                </div>
                              </div>
                            </td>
                            <td className="manager-column-centered">Quiz</td>
                            <td className="manager-status-cell">
                              <StatusBadge
                                tone={
                                  review.kind === "full"
                                    ? "success"
                                    : review.kind === "partial"
                                      ? "warning"
                                      : "neutral"
                                }
                                ariaLabel="Open quiz questions"
                                onClick={() => {
                                  setPage({ kind: "quiz", quiz });
                                  setQuizTab(quiz.type === "contest" ? "questions" : "alphabets");
                                }}
                              >
                                {review.reviewed}/{review.total}
                              </StatusBadge>
                            </td>
                            <td className="manager-status-cell">
                              <StatusBadge tone={review.kind === "full" ? "success" : "neutral"}>
                                {review.kind === "full" ? "Included" : "Not ready"}
                              </StatusBadge>
                            </td>
                            <td>
                              <span className="topic-status-na">—</span>
                            </td>
                          </tr>
                        );
                      })
                    : isContest
                      ? visibleQuizzes.map((quiz) => {
                          const review = quizReviewStatus(quiz);
                          const migration = migrationForQuiz(quiz);
                          const percent = migration
                            ? migration.total
                              ? Math.min(
                                  100,
                                  Math.round(
                                    (migration.processed / migration.total) *
                                      100,
                                  ),
                                )
                              : 100
                            : 0;
                          const activeMigration =
                            migration &&
                            (migration.status === "queued" ||
                              migration.status === "running");
                          return (
                            <tr
                              key={quiz.key}
                              onClick={() => {
                                setPage({ kind: "quiz", quiz });
                                setQuizTab(
                                  quiz.type === "contest"
                                    ? "questions"
                                    : "alphabets",
                                );
                              }}
                            >
                              <td>
                                <div className="manager-list-identity">
                                  <ManagerListIcon
                                    topicId={quiz.contest}
                                    reference={quiz.icon}
                                    label={quiz.title}
                                    kind="quiz"
                                  />
                                  <div>
                                    <strong>{quiz.title}</strong>
                                    <span>{quiz.id}</span>
                                  </div>
                                </div>
                              </td>
                              <td>
                                <span
                                  className={`badge quiz-version quiz-version-${quiz.questionStorageVersion}`}
                                >
                                  {quiz.questionStorageVersion ===
                                  "questions-v1"
                                    ? "Questions v1"
                                    : "Legacy"}
                                </span>
                              </td>
                              <td>{quiz.grade ?? "—"}</td>
                              <td>
                                <strong>{quiz.year ?? "—"}</strong>
                                <span>{quiz.round ?? "No round"}</span>
                              </td>
                              <td>{quiz.questionCount ?? "—"}</td>
                              <td>
                                <span
                                  className={`badge review-status review-status-${review.kind}`}
                                  title={review.label}
                                  aria-label={`${review.label}: ${review.reviewed} of ${review.total}`}
                                >
                                  {review.reviewed}/{review.total}
                                </span>
                                {quiz.migrationErrorCount > 0 && (
                                  <span className="badge badge-error">
                                    {quiz.migrationErrorCount} errors
                                  </span>
                                )}
                              </td>
                              <td>
                                {migration ? (
                                  migration.status === "completed" ? (
                                    <span className="badge job-status job-status-completed">
                                      Migrated ({migration.succeeded}/
                                      {migration.total})
                                    </span>
                                  ) : (
                                    <div className="quiz-migration-status">
                                      <span
                                        className={`badge job-status job-status-${migration.status}`}
                                      >
                                        {migration.status}
                                      </span>
                                      <span>
                                        {activeMigration
                                          ? `${percent}% · ${migration.processed}/${migration.total}`
                                          : `${migration.succeeded} saved${migration.failed ? ` · ${migration.failed} failed` : ""}`}
                                      </span>
                                    </div>
                                  )
                                ) : (
                                  <span className="badge job-status">
                                    Not started
                                  </span>
                                )}
                              </td>
                              <td>
                                <ChevronRight size={16} />
                              </td>
                            </tr>
                          );
                        })
                      : visibleContests.map((contest) => {
                          const ready = contest.quizzes.filter((quiz) =>
                            ["reviewed", "validated", "published"].includes(
                              quiz.contentStatus,
                            ),
                          ).length;
                          const builds = contest.quizzes.filter(
                            (quiz) => quiz.hasGeneratedArtifact,
                          ).length;
                          const topicSummary = snapshot.contentV2.topics.find(
                            (topic) => topic.id === contest.id,
                          );
                          return (
                            <tr key={contest.id}>
                              <td>
                                <div className="manager-list-identity">
                                  <ManagerListIcon
                                    topicId={contest.id}
                                    reference={contest.settings.book.icon}
                                    label={contest.title}
                                    kind="topic"
                                  />
                                  <div>
                                    <strong>{contest.title}</strong>
                                    <span>
                                      {contest.description ||
                                        contest.id.toUpperCase()}
                                    </span>
                                  </div>
                                </div>
                              </td>
                              <td
                                className={
                                  topicMode
                                    ? "manager-column-centered"
                                    : undefined
                                }
                              >
                                {topicMode ? "Topic" : contest.quizzes.length}
                              </td>
                              {topicMode && topicSummary ? (
                                <>
                                  <td className="manager-status-cell">
                                    {(() => {
                                      const status = topicSummary.status;
                                      return (
                                        <StatusBadge
                                          tone={
                                            status === "reviewed"
                                              ? "success"
                                              : status === "rejected"
                                                ? "warning"
                                                : "neutral"
                                          }
                                          ariaLabel="Open topic review"
                                          onClick={() => {
                                            setPage({
                                              kind: "contest",
                                              contest: contest.id,
                                            });
                                            setContestTab("info");
                                          }}
                                        >
                                          {status === "reviewed" ? "Ready" : status === "rejected" ? "Rejected" : "Needs review"}
                                        </StatusBadge>
                                      );
                                    })()}
                                  </td>
                                  <td className="manager-status-cell">
                                    {(() => {
                                      const status =
                                        topicMarketplaceStatus(topicSummary);
                                      return (
                                        <StatusBadge
                                          tone={
                                            status.kind === "current"
                                              ? "success"
                                              : status.kind === "changed"
                                                ? "warning"
                                                : "neutral"
                                          }
                                          ariaLabel="Open topic marketplace tab"
                                          onClick={() => {
                                            setPage({
                                              kind: "contest",
                                              contest: contest.id,
                                            });
                                            setContestTab("info");
                                          }}
                                        >
                                          {status.label}
                                        </StatusBadge>
                                      );
                                    })()}
                                  </td>
                                </>
                              ) : (
                                <>
                                  <td>{ready}</td>
                                  <td>{builds}</td>
                                </>
                              )}
                              <td>
                                {topicMode ? (
                                  <div className="manager-row-actions">
                                    <TableActionButton
                                      color="primary"
                                      icon={<Pencil />}
                                      aria-label="Edit topic"
                                      title="Edit topic"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        setPage({
                                          kind: "contest",
                                          contest: contest.id,
                                        });
                                        setContestTab("info");
                                      }}
                                    />
                                    <ActionMenu
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
                                                const result = await managerApi.publishContentV2Topic(contest.id);
                                                if (result.snapshot) onSnapshotChange(result.snapshot);
                                                onOpenJobs();
                                                toast.show({
                                                  title: "Publish to Market started",
                                                  description: `Synchronizing ${contest.title} content and marketplace listing.`,
                                                });
                                              },
                                            ),
                                        },
                                      ]}
                                    />
                                  </div>
                                ) : (
                                  <ChevronRight size={16} />
                                )}
                              </td>
                            </tr>
                          );
                        })}
                </tbody>
              </table>
              {(isContest ? visibleQuizzes : visibleContests).length === 0 && (
                <div className="no-results">
                  No matching{" "}
                  {isContest ? "quizzes" : topicMode ? "topics" : "contests"}.
                </div>
              )}
          </div>
        </>
      )}
    </>
  );
}
