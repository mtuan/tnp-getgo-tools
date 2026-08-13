import { ChevronRight, ListOrdered, Search, Rows3 } from "lucide-react";
import type { ContestSummary, QuizSummary, RepositorySnapshot } from "../../core/models";
import { Button } from "../ui/Button";
import { StatusBadge } from "../ui/StatusBadge";
import { ActionMenu } from "../ui/ActionMenu";
import { marketplaceStateLabel, marketplaceStateTone, quizMarketplaceStatus, topicMarketplaceSyncStatus } from "../topic-status";
import { ManagerListIcon, quizReviewStatus } from "./shared";
import { renderTopicTree } from "./TopicTree";
import { withMarketplaceTopicState, type MarketplaceTopicState } from "../../core/marketplace-topic-state";
import en from "../locales/en.json";
import vi from "../locales/vi.json";

type ContestWithQuizzes = ContestSummary & { quizzes: QuizSummary[] };
type ManagerListContext = Record<string, any> & {
  snapshot: RepositorySnapshot;
  visibleContests: ContestWithQuizzes[];
  visibleQuizzes: QuizSummary[];
};

export function renderManagerList(context: ManagerListContext) {
  const {
    buttonAction,
    contestTab,
    isContest,
    locale,
    migrationForQuiz,
    onSnapshotChange,
    query,
    runButtonAction,
    setContestTab,
    setPage,
    setQuery,
    setQuizTab,
    setTopicsView,
    snapshot,
    selectedContest,
    toast,
    topicMode,
    topicsView,
    visibleContests,
    visibleQuizzes,
  } = context;
  const marketplaceCopy = (locale === "vi" ? vi : en).marketplaceManager;
  const batchMarketplaceState = (state: MarketplaceTopicState) =>
    runButtonAction(`batch-market-${state}`, async () => {
      let latest: RepositorySnapshot | null = null;
      if (isContest) {
        const quizzes = snapshot.contentV2.quizzes.filter(
          (quiz) => quiz.topicId === selectedContest?.id,
        );
        for (const summary of quizzes) {
          const quiz = await window.getgo.loadContentV2Quiz(summary.topicId, summary.id);
          latest = await window.getgo.saveContentV2Quiz(summary.topicId, {
            ...quiz,
            marketplace: withMarketplaceTopicState(quiz.marketplace, state),
          });
        }
        if (latest) onSnapshotChange(latest);
        toast.show({
          title: marketplaceCopy.batchUpdated,
          description: marketplaceCopy.batchUpdatedDescription
            .replace("{count}", String(quizzes.length))
            .replace("{state}", marketplaceCopy.states[state]),
        });
        return;
      }
      for (const summary of snapshot.contentV2.topics) {
        const topic = await window.getgo.loadContentV2Topic(summary.id);
        latest = await window.getgo.saveContentV2Topic({
          ...topic,
          marketplace: withMarketplaceTopicState(topic.marketplace, state),
        });
      }
      if (latest) onSnapshotChange(latest);
      toast.show({
        title: marketplaceCopy.batchUpdated,
        description: marketplaceCopy.batchUpdatedDescription
          .replace("{count}", String(snapshot.contentV2.topics.length))
          .replace("{state}", marketplaceCopy.states[state]),
      });
    });
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
            {topicMode && (isContest || topicsView === "list") && (
              <ActionMenu
                label={marketplaceCopy.batchActions}
                disabled={Boolean(buttonAction)}
                items={[
                  {
                    id: "list-all",
                    label: marketplaceCopy.listAll,
                    onSelect: () => void batchMarketplaceState("listed"),
                  },
                  {
                    id: "unlist-all",
                    label: marketplaceCopy.unlistAll,
                    onSelect: () => void batchMarketplaceState("unlisted"),
                  },
                ]}
              />
            )}
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
                              {(() => {
                                const state = marketplaceStateLabel(quiz.marketplace).state;
                                return <StatusBadge tone={marketplaceStateTone(state)}>{marketplaceCopy.states[state]}</StatusBadge>;
                              })()}
                            </td>
                            <td className="manager-status-cell">
                              <StatusBadge tone={quizMarketplaceStatus(quiz).kind === "current" ? "success" : "warning"}>
                                {quizMarketplaceStatus(quiz).label}
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
                            <tr
                              key={contest.id}
                              onClick={() => {
                                setPage({ kind: "contest", contest: contest.id });
                                setContestTab("info");
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
                                        >
                                          {status === "reviewed" ? "Ready" : status === "rejected" ? "Rejected" : "Needs review"}
                                        </StatusBadge>
                                      );
                                    })()}
                                  </td>
                                  <td className="manager-status-cell">
                                    {(() => {
                                      const state = marketplaceStateLabel(topicSummary.marketplace).state;
                                      return <StatusBadge tone={marketplaceStateTone(state)}>{marketplaceCopy.states[state]}</StatusBadge>;
                                    })()}
                                  </td>
                                  <td className="manager-status-cell">
                                    {(() => {
                                      const status = topicMarketplaceSyncStatus(topicSummary);
                                      return (
                                        <StatusBadge
                                          tone={
                                            status.kind === "current"
                                              ? "success"
                                              : status.kind === "changed"
                                                ? "warning"
                                                : "neutral"
                                          }
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
          </div>
        </>
      )}
    </>
  );
}
