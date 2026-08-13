import { FolderOpen, Trash2 } from "lucide-react";
import type { QuizCrudInput, RepositorySnapshot } from "../../../../shared/domain/models";
import { QuizCrudDialog } from "../../components/CrudDialogs";
import { ContestSettingsDialog } from "../../components/ContestSettingsDialog";
import { MigrationResultsDrawer } from "../../components/MigrationResultsDrawer";
import { Button } from "../../../../shared/ui/Button";
import { Select } from "../../../../shared/ui/Select";
import { PageHeader } from "../../../../shared/ui/PageHeader";
import { Tabs } from "../../../../shared/ui/Tabs";
import { AccordionGroup } from "../../../../shared/ui/Accordion";
import { MarketplaceMetadataSection } from "../../components/MarketplaceMetadataSection";
import { KidLearningDictionaryEditor } from "../../components/KidLearningDictionaryEditor";
import { TopicAssetsEditor } from "../../components/TopicAssetsEditor";
import type { ContestDetailTab } from "./shared";
import { renderManagerList } from "./ManagerList";
import { ManagerHeaderControls } from "./ManagerHeaderControls";
import {
  marketplaceTopicState,
  withMarketplaceTopicState,
  type MarketplaceTopicState,
} from "../../../../features/topics/domain/marketplace-topic-state";
import en from "../../../../shared/localization/en.json";
import vi from "../../../../shared/localization/vi.json";

type ManagerPageContext = Record<string, any> & {
  snapshot: RepositorySnapshot;
};

export function renderManagerPage(context: ManagerPageContext) {
  const {
    buttonAction,
    contestDialog,
    contestTab,
    contests,
    locale,
    managerApi,
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
    snapshot,
    toast,
    topicDictionary,
    topicResourceError,
  } = context;
  const isContest = page.kind === "contest";
  const topicMode = routeMode === "topics";
  const marketplaceCopy = (locale === "vi" ? vi : en).marketplaceManager;
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
            {(!isContest || contestTab === "quizzes") && <ManagerHeaderControls {...context} isContest={isContest} topicMode={topicMode} />}
            {isContest && contestTab === "info" && selectedContest && (
              <>
                {topicMode && selectedTopic && (
                  <Select
                    className="manager-market-state-select"
                    ariaLabel={marketplaceCopy.stateLabel}
                    value={marketplaceTopicState(selectedTopic.marketplace)}
                    disabled={Boolean(buttonAction)}
                    options={[
                      { value: "listed", label: marketplaceCopy.states.listed },
                      { value: "featured", label: marketplaceCopy.states.featured },
                      { value: "unlisted", label: marketplaceCopy.states.unlisted },
                      { value: "removed", label: marketplaceCopy.states.removed },
                    ]}
                    onValueChange={(value) =>
                      void runButtonAction("market-state", async () => {
                        const topic = await managerApi.loadContentV2Topic(selectedTopic.id);
                        const next = await managerApi.saveContentV2Topic({
                          ...topic,
                          marketplace: withMarketplaceTopicState(
                            topic.marketplace,
                            value as MarketplaceTopicState,
                          ),
                        });
                        onSnapshotChange(next);
                        toast.show({
                          title: marketplaceCopy.stateUpdated,
                          description: marketplaceCopy.stateUpdatedDescription.replace(
                            "{state}",
                            marketplaceCopy.states[value as MarketplaceTopicState],
                          ),
                        });
                      })
                    }
                  />
                )}
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
        <AccordionGroup defaultExpanded="general">
          <ContestSettingsDialog
            embedded
            topicMode={topicMode}
            contest={selectedContest}
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
              recordKey={`topic:${selectedTopic.id}`}
              locale={locale}
              load={() => managerApi.loadContentV2Topic(selectedTopic.id)}
              save={async (record) => {
                if ("topicId" in record) throw new Error("Expected topic metadata.");
                const next = await managerApi.saveContentV2Topic(record);
                onSnapshotChange(next);
              }}
            />
          )}
        </AccordionGroup>
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
              locale={locale}
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
