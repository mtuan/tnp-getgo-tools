import { FolderOpen, Plus, RefreshCw, RotateCcw, Save, Trash2 } from "lucide-react";
import type { QuizCrudInput, RepositorySnapshot } from "../../core/models";
import { QuizCrudDialog } from "../CrudDialogs";
import { ContestSettingsDialog } from "../ContestSettingsDialog";
import { MigrationResultsDrawer } from "../MigrationResultsDrawer";
import { Button } from "../ui/Button";
import { PageHeader } from "../ui/PageHeader";
import { Tabs } from "../ui/Tabs";
import { MarketplaceMetadataSection } from "../MarketplaceMetadataSection";
import { KidLearningDictionaryEditor } from "../KidLearningDictionaryEditor";
import { TopicAssetsEditor } from "../TopicAssetsEditor";
import type { ContestDetailTab } from "./shared";
import { renderManagerList } from "./ManagerList";

type ManagerPageContext = Record<string, any> & {
  snapshot: RepositorySnapshot;
};

export function renderManagerPage(context: ManagerPageContext) {
  const {
    allLegacyQuizCount,
    buttonAction,
    contestDialog,
    contestTab,
    contests,
    legacyQuizCount,
    locale,
    managerApi,
    migrateAllLegacyQuizzes,
    migrateLegacyQuizzes,
    migrationResults,
    onRouteChange,
    onSnapshotChange,
    page,
    quizDialog,
    rootRoute,
    routeMode,
    runButtonAction,
    selectedContest,
    setContestDialog,
    setContestTab,
    setMigrationResults,
    setPage,
    setQuizDialog,
    setTopicDictionary,
    setTopicInfoDirty,
    snapshot,
    toast,
    topicDictionary,
    topicInfoDirty,
    topicResourceError,
  } = context;
  const isContest = page.kind === "contest";
  const topicMode = routeMode === "topics";
  const selectedTopic = isContest
    ? snapshot.contentV2.topics.find((topic) => topic.id === page.contest)
    : undefined;
  return (
    <section className="manager">
      <PageHeader
        eyebrow="Quiz manager"
        breadcrumbs={
          isContest
            ? [
                {
                  label: topicMode ? "Topics" : "Contests",
                  onClick: () => setPage({ kind: "contests" }),
                },
              ]
            : undefined
        }
        title={
          isContest
            ? (selectedContest?.title ?? page.contest.toUpperCase())
            : topicMode
              ? "Topics"
              : "Contests"
        }
        description={
          isContest
            ? `${selectedContest?.quizzes.length ?? 0} quizzes in this ${topicMode ? "topic" : "contest"}`
            : `${contests.length} ${topicMode ? "topics" : "contests"} across the local repository`
        }
        titleAction={
          isContest && selectedContest ? (
            <Button
              className="ui-page-header-folder"
              icon={<FolderOpen />}
              variant="icon"
              disabled={Boolean(buttonAction)}
              aria-label={`Show ${topicMode ? "topic" : "contest"} in folder`}
              title={`Show ${topicMode ? "topic" : "contest"} in folder`}
              onClick={() =>
                void runButtonAction("show-contest-folder", () =>
                  managerApi.showInFolder(selectedContest.settingsPath),
                )
              }
            />
          ) : undefined
        }
        actions={
          <>
            {!isContest && allLegacyQuizCount > 0 && (
              <Button
                icon={<RefreshCw size={15} />}
                loading={buttonAction === "migrate-all-legacy"}
                variant="solid"
                color="warning"
                disabled={Boolean(buttonAction)}
                onClick={() => void migrateAllLegacyQuizzes()}
              >
                Migrate all {allLegacyQuizCount}
              </Button>
            )}
            {isContest && contestTab === "quizzes" && legacyQuizCount > 0 && (
              <Button
                icon={<RefreshCw size={15} />}
                loading={buttonAction === "migrate-legacy"}
                variant="solid"
                color="warning"
                disabled={Boolean(buttonAction)}
                onClick={() => void migrateLegacyQuizzes()}
              >
                Migrate {legacyQuizCount}
              </Button>
            )}
            {(!isContest || contestTab === "quizzes") && (
              <Button
                icon={<Plus size={15} />}
                variant="solid"
                disabled={Boolean(buttonAction)}
                onClick={() =>
                  isContest
                    ? setQuizDialog("create")
                    : setContestDialog("create")
                }
              >
                {isContest
                  ? "Create quiz"
                  : `Create ${topicMode ? "topic" : "contest"}`}
              </Button>
            )}
            {isContest && contestTab === "info" && selectedContest && (
              <>
                <Button
                  type="reset"
                  form="topic-info-form"
                  icon={<RotateCcw size={15} />}
                  color="neutral"
                  disabled={!topicInfoDirty}
                >
                  Discard
                </Button>
                <Button
                  type="submit"
                  form="topic-info-form"
                  icon={<Save size={15} />}
                  variant="solid"
                  disabled={!topicInfoDirty}
                >
                  Save
                </Button>
                <Button
                  icon={<Trash2 size={15} />}
                  loading={buttonAction === "delete-contest"}
                  variant="solid"
                  color="danger"
                  disabled={Boolean(buttonAction)}
                  onClick={() => {
                    if (
                      !window.confirm(
                        `Delete ${selectedContest.title}? This will move the ${topicMode ? "topic" : "contest"} folder to Trash.`,
                      )
                    )
                      return;
                    void runButtonAction("delete-contest", async () => {
                      const next = await managerApi.deleteContest(
                        selectedContest.id,
                      );
                      onRouteChange(rootRoute);
                      setPage({ kind: "contests" });
                      onSnapshotChange(next);
                      toast.show({
                        title: `${topicMode ? "Topic" : "Contest"} deleted`,
                        description: `${selectedContest.title} was moved to Trash.`,
                      });
                    });
                  }}
                >
                  Delete {topicMode ? "topic" : "contest"}
                </Button>
              </>
            )}
          </>
        }
      />
      {isContest && (
        <Tabs<ContestDetailTab>
          variant="underline"
          className="contest-detail-tabs"
          ariaLabel={`${topicMode ? "Topic" : "Contest"} detail`}
          value={contestTab}
          onChange={setContestTab}
          items={[
            {
              id: "quizzes",
              label: "Quizzes",
            },
            { id: "info", label: "Info" },
            ...(topicMode && selectedTopic?.type === "kid-learning"
              ? [
                  { id: "dictionaries" as const, label: "Dictionaries" },
                  { id: "assets" as const, label: "Assets" },
                ]
              : []),
          ]}
        />
      )}
      {isContest && contestTab === "info" && selectedContest && (
        <>
          <ContestSettingsDialog
            embedded
            topicMode={topicMode}
            contest={selectedContest}
            onDirtyChange={setTopicInfoDirty}
            onClose={() => undefined}
            onSaved={async (settings) => {
              const next = await managerApi.updateContest(
                selectedContest.id,
                settings,
              );
              onSnapshotChange(next);
              toast.show({
                title: `${topicMode ? "Topic" : "Contest"} updated`,
                description: `${settings.book.title} was saved.`,
              });
            }}
          />
          {topicMode && selectedTopic && (
            <MarketplaceMetadataSection
              locale={locale}
              load={() => managerApi.loadContentV2Topic(selectedTopic.id)}
              save={async (record) => {
                if ("topicId" in record) throw new Error("Expected topic metadata.");
                const next = await managerApi.saveContentV2Topic(record);
                onSnapshotChange(next);
              }}
            />
          )}
        </>
      )}
      {topicMode &&
        isContest &&
        contestTab === "dictionaries" &&
        selectedTopic?.type === "kid-learning" && (
          <>
            {topicResourceError && (
              <div className="error-banner">
                <strong>Could not load shared dictionary</strong>
                <span>{topicResourceError}</span>
              </div>
            )}
            <KidLearningDictionaryEditor
              topicId={selectedTopic.id}
              dictionary={topicDictionary}
              onSave={async (dictionary) => {
                const next = await window.getgo.saveContentV2TopicDictionary(
                  selectedTopic.id,
                  dictionary,
                );
                setTopicDictionary(dictionary);
                onSnapshotChange(next);
                toast.show({
                  title: "Shared dictionary saved",
                  description:
                    "Alphabet and spelling quizzes now use the updated concepts.",
                });
              }}
            />
          </>
        )}
      {topicMode &&
        isContest &&
        contestTab === "assets" &&
        selectedTopic?.type === "kid-learning" && (
          <TopicAssetsEditor topicId={selectedTopic.id} />
        )}
      {renderManagerList({ ...context, isContest, topicMode } as any)}
      {contestDialog && (
        <ContestSettingsDialog
          topicMode={topicMode}
          contest={contestDialog === "create" ? undefined : contestDialog}
          onClose={() => setContestDialog(null)}
          onSaved={async (settings) => {
            const creating = contestDialog === "create";
            const next = creating
              ? await managerApi.createContest(settings)
              : await managerApi.updateContest(contestDialog.id, settings);
            onSnapshotChange(next);
            setContestDialog(null);
            toast.show({
              title: creating
                ? `${topicMode ? "Topic" : "Contest"} created`
                : `${topicMode ? "Topic" : "Contest"} updated`,
              description: `${settings.book.title} was saved.`,
            });
          }}
          onDeleted={
            contestDialog !== "create"
              ? async () => {
                  const title = contestDialog.title;
                  const next = await managerApi.deleteContest(contestDialog.id);
                  onRouteChange(rootRoute);
                  setContestDialog(null);
                  setPage({ kind: "contests" });
                  onSnapshotChange(next);
                  toast.show({
                    title: `${topicMode ? "Topic" : "Contest"} deleted`,
                    description: `${title} was moved to Trash.`,
                  });
                }
              : undefined
          }
        />
      )}
      {quizDialog === "create" && isContest && selectedContest && (
        <QuizCrudDialog
          contest={selectedContest}
          onClose={() => setQuizDialog(null)}
          onSaved={async (input: QuizCrudInput) => {
            const next = await managerApi.createQuiz(page.contest, {
              ...input,
              status: "imported",
            });
            onSnapshotChange(next);
            setQuizDialog(null);
            toast.show({
              title: "Quiz created",
              description: `${input.title} is ready to edit.`,
            });
          }}
        />
      )}
      {migrationResults && (
        <MigrationResultsDrawer
          result={migrationResults.result}
          attempted={migrationResults.attempted}
          onClose={() => setMigrationResults(null)}
        />
      )}
    </section>
  );

}
