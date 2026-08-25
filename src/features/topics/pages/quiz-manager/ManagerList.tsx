import { ChevronRight } from "lucide-react";
import type { ContestSummary, QuizSummary, RepositoryViewData } from "../../../../shared/domain/models";
import { StatusBadge } from "../../../../shared/ui/StatusBadge";
import { marketplaceStateLabel } from "../../../../renderer/topic-status";
import { marketplaceSyncPlanStatus } from "../../domain/marketplace-sync-plan";
import { contentV2QuizReviewStatus, quizReviewStatus } from "./shared";
import { TopicQuizIcon as ManagerListIcon } from "../../components/TopicQuizTreeIdentity";
import { MarketplaceStateCell } from "../../components/MarketplaceStateCell";
import { renderTopicTree } from "./TopicTree";
import en from "../../../../shared/localization/en.json";
import vi from "../../../../shared/localization/vi.json";

type ContestWithQuizzes = ContestSummary & { quizzes: QuizSummary[] };
type ManagerListContext = Record<string, any> & {
  snapshot: RepositoryViewData;
  visibleContests: ContestWithQuizzes[];
  visibleQuizzes: QuizSummary[];
};

export function renderManagerList(context: ManagerListContext) {
  const {
    contestTab,
    isContest,
    locale,
    managerApi,
    migrationForQuiz,
    openQuiz,
    setContestTab,
    setPage,
    snapshot,
    syncPlan,
    topicMode,
    toast,
    topicsView,
    visibleContests,
    visibleQuizzes,
  } = context;
  const marketplaceCopy = (locale === "vi" ? vi : en).marketplaceManager;
  return (
    <>
      {(!isContest || contestTab === "quizzes") && (
        <>
          {(!topicMode || isContest || topicsView === "tree") && renderTopicTree(context as any)}
          {(isContest || !topicMode || topicsView === "list") && <div className="manager-table">
              <table>
                {topicMode && (
                  <colgroup>
                    <col />
                    <col style={{ width: 100 }} />
                    <col style={{ width: 136 }} />
                    <col style={{ width: 112 }} />
                    <col style={{ width: 144 }} />
                  </colgroup>
                )}
                <thead>
                  <tr>
                    {topicMode && isContest ? (
                      <>
                        <th>Quiz</th>
                        <th className="manager-column-centered">Type</th>
                        <th className="manager-column-centered">Review</th>
                        <th className="manager-column-centered">State</th>
                        <th className="manager-column-centered">Sync status</th>
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
                        {!topicMode && <th />}
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
                            <th className="manager-column-centered">State</th>
                            <th className="manager-column-centered">Sync status</th>
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
                        const review = contentV2QuizReviewStatus(snapshot, quiz);
                        return (
                          <tr
                            key={quiz.key}
                            data-manager-search-row="true"
                            data-manager-search-text={`${quiz.id} ${quiz.title} ${quiz.legacyId} ${quiz.grade ?? ""} ${quiz.round ?? ""} ${quiz.year ?? ""}`.toLocaleLowerCase()}
                            onClick={() => {
                              openQuiz(quiz);
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
                                  openQuiz(quiz);
                                }}
                              >
                                {review.reviewed}/{review.total}
                              </StatusBadge>
                            </td>
                            <td className="manager-status-cell manager-market-state-table-cell">
                              {(() => {
                                const state = marketplaceStateLabel(quiz.marketplace).state;
                                return <MarketplaceStateCell locale={locale} value={state} target="quizzes" id={quiz.id} topicId={quiz.contest} api={managerApi} quizReview={{ manifestPath: quiz.manifestPath, reviewed: review.reviewed, total: review.total }} onSaved={(value) => toast.show({ title: marketplaceCopy.stateUpdated, description: marketplaceCopy.stateUpdatedDescription.replace("{state}", marketplaceCopy.states[value]), variant: "success" })} onError={(error) => toast.show({ title: marketplaceCopy.publishFailed, description: String(error), variant: "error" })} />;
                              })()}
                            </td>
                            <td className="manager-status-cell">
                              <StatusBadge tone={marketplaceSyncPlanStatus(syncPlan, "quiz", `${quiz.contest}/${quiz.id}`) === "current" ? "success" : "warning"}>
                                {marketplaceSyncPlanStatus(syncPlan, "quiz", `${quiz.contest}/${quiz.id}`) === "current" ? "Up to date" : marketplaceSyncPlanStatus(syncPlan, "quiz", `${quiz.contest}/${quiz.id}`) === "needs-review" ? "Needs review" : "Needs sync"}
                              </StatusBadge>
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
                              data-manager-search-row="true"
                              data-manager-search-text={`${quiz.id} ${quiz.title} ${quiz.legacyId} ${quiz.grade ?? ""} ${quiz.round ?? ""} ${quiz.year ?? ""}`.toLocaleLowerCase()}
                              onClick={() => {
                                openQuiz(quiz);
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
                            <tr
                              key={contest.id}
                              data-manager-search-row="true"
                              data-manager-search-text={`${contest.id} ${contest.title} ${contest.description}`.toLocaleLowerCase()}
                              onClick={() => {
                                setPage({ kind: "contest", contest: contest.id });
                                setContestTab("quizzes");
                              }}
                            >
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
                                      const questions = snapshot.contentV2.questions.filter((question) => question.topicId === topicSummary.id);
                                      const reviewed = questions.filter((question) => question.status === "reviewed").length;
                                      return (
                                        <StatusBadge
                                          tone={
                                            questions.length > 0 && reviewed === questions.length
                                              ? "success"
                                              : reviewed > 0
                                                ? "warning"
                                                : "neutral"
                                          }
                                        >
                                          {reviewed}/{questions.length}
                                        </StatusBadge>
                                      );
                                    })()}
                                  </td>
                                  <td className="manager-status-cell manager-market-state-table-cell">
                                    {(() => {
                                      const state = marketplaceStateLabel(topicSummary.marketplace).state;
                                      return <MarketplaceStateCell locale={locale} value={state} target="topics" id={topicSummary.id} api={managerApi} onSaved={(value) => toast.show({ title: marketplaceCopy.stateUpdated, description: marketplaceCopy.stateUpdatedDescription.replace("{state}", marketplaceCopy.states[value]), variant: "success" })} onError={(error) => toast.show({ title: marketplaceCopy.publishFailed, description: String(error), variant: "error" })} />;
                                    })()}
                                  </td>
                                  <td className="manager-status-cell">
                                    {(() => {
                                      const value = marketplaceSyncPlanStatus(syncPlan, "topic", topicSummary.id);
                                      return (
                                        <StatusBadge
                                          tone={value === "current" ? "success" : "warning"}
                                        >
                                          {value === "current" ? "Up to date" : value === "needs-review" ? "Needs review" : "Needs sync"}
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
                              {!topicMode && <td><ChevronRight size={16} /></td>}
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
              {(isContest ? visibleQuizzes : visibleContests).length > 0 && (
                <div className="no-results" data-manager-search-empty hidden>
                  No matching {isContest ? "quizzes" : topicMode ? "topics" : "contests"}.
                </div>
              )}
          </div>}
        </>
      )}
    </>
  );
}
