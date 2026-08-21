import { useCallback, useEffect, useRef, useState } from "react";
import { ListOrdered, Plus, RefreshCw, Rows3 } from "lucide-react";
import type { BackgroundJob, MarketplaceStateUpdateResult, MarketplaceSyncJobItem, RepositoryViewData } from "../../../../shared/domain/models";
import { marketplaceTopicState, type MarketplaceTopicState } from "../../../../features/topics/domain/marketplace-topic-state";
import * as ui from "../../../../shared/ui";
import en from "../../../../shared/localization/en.json";
import vi from "../../../../shared/localization/vi.json";
import { MarketplaceSyncDrawer } from "../../components/MarketplaceSyncDrawer";
import { TopicFilterControls } from "./TopicFilterControls";
import { marketplaceSyncCandidateTopicIds } from "../../domain/marketplace-sync-plan";
import { ManagerSearchInput } from "./ManagerSearchInput";

type Context = Record<string, any> & { snapshot: RepositoryViewData };
const activeStatuses = new Set(["queued", "running", "paused"]);
const isSyncJob = (job: BackgroundJob) => job.kind === "publish" && job.name === "Sync marketplace · All topics" && activeStatuses.has(job.status);

function applyMarketplaceStateUpdate(snapshot: RepositoryViewData, result: MarketplaceStateUpdateResult): RepositoryViewData {
  const records = new Map(result.records.map((record) => [record.id, record]));
  if (result.target === "topics") return { ...snapshot, contentV2: { ...snapshot.contentV2, topics: snapshot.contentV2.topics.map((topic) => {
    const record = records.get(topic.id);
    return record ? { ...topic, marketplace: record.marketplace, marketplaceLocalHash: record.marketplaceLocalHash } : topic;
  }) } };
  return {
    ...snapshot,
    quizzes: snapshot.quizzes.map((quiz) => {
      const record = quiz.contest === result.topicId ? records.get(quiz.id) : undefined;
      return record ? { ...quiz, marketplace: record.marketplace } : quiz;
    }),
    contentV2: { ...snapshot.contentV2, quizzes: snapshot.contentV2.quizzes.map((quiz) => {
      const record = quiz.topicId === result.topicId ? records.get(quiz.id) : undefined;
      return record ? { ...quiz, marketplace: record.marketplace } : quiz;
    }) },
  };
}

function useMarketplaceSync(locale: Context["locale"], toast: Context["toast"], onOpenJobs: () => void, onSettled: () => Promise<void>) {
  const copy = (locale === "vi" ? vi : en).marketplaceManager;
  const [job, setJob] = useState<BackgroundJob | null>(null);
  const activeJobId = useRef<string | null>(null);
  const load = useCallback(async () => {
    const next = (await window.getgo.getBackgroundJobs()).jobs.find(isSyncJob) ?? null;
    if (next) activeJobId.current = next.id;
    else if (activeJobId.current) {
      activeJobId.current = null;
      await onSettled();
    }
    setJob(next);
  }, [onSettled]);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), job ? 500 : 2500);
    return () => window.clearInterval(timer);
  }, [job, load]);
  const start = async (items: MarketplaceSyncJobItem[]) => {
    try {
      const nextJob = (await window.getgo.syncContentV2Marketplace(items)).jobs.find(isSyncJob) ?? null;
      activeJobId.current = nextJob?.id ?? null;
      setJob(nextJob);
      toast.show({
        title: copy.syncStarted,
        description: nextJob?.description ?? copy.syncStartedDescription,
        variant: "success",
        action: { label: copy.viewJob, onSelect: onOpenJobs },
      });
      return true;
    }
    catch (error) {
      toast.show({ title: copy.publishFailed, description: String(error), variant: "error" });
      return false;
    }
  };
  return { job, start, label: job ? copy.syncing.replace("{completed}", String(job.completed)).replace("{total}", String(job.total)) : copy.sync };
}

export function ManagerHeaderControls(context: Context) {
  const { allLegacyQuizCount, buttonAction, isContest, legacyQuizCount, locale, managerApi, migrateAllLegacyQuizzes, migrateLegacyQuizzes, onOpenJobs, onSnapshotChange, runButtonAction, selectedContest, setContestDialog, setQuizDialog, setTopicGrades, setTopicSubjects, setTopicsView, snapshot, toast, topicGradeOptions, topicGrades, topicMode, topicSubjectOptions, topicSubjects, topicsView } = context;
  const copy = (locale === "vi" ? vi : en).marketplaceManager;
  const refreshAfterSync = useCallback(async () => {
    const route = await window.getgo.loadContentV2Route();
    onSnapshotChange({ ...snapshot, loadedAt: route.loadedAt, contentV2: route.content });
  }, [onSnapshotChange, snapshot]);
  const sync = useMarketplaceSync(locale, toast, onOpenJobs, refreshAfterSync);
  const [syncPreviewOpen, setSyncPreviewOpen] = useState(false);
  const [loadingSyncPreview, setLoadingSyncPreview] = useState(false);
  const [syncPreview, setSyncPreview] = useState<RepositoryViewData["contentV2"] | null>(null);
  const [startingSync, setStartingSync] = useState(false);
  const openSyncPreview = async () => {
    setLoadingSyncPreview(true);
    try {
      const topicIds = marketplaceSyncCandidateTopicIds(
        snapshot.contentV2.topics,
        snapshot.contentV2.quizzes,
      );
      const loaded = await Promise.all(
        topicIds.map((topicId) => window.getgo.loadContentV2Route(topicId)),
      );
      const refreshedIds = new Set(topicIds);
      setSyncPreview({
        ...snapshot.contentV2,
        topics: [
          ...snapshot.contentV2.topics.filter((topic) => !refreshedIds.has(topic.id)),
          ...loaded.flatMap((result) => result.content.topics),
        ],
        quizzes: [
          ...snapshot.contentV2.quizzes.filter((quiz) => !refreshedIds.has(quiz.topicId)),
          ...loaded.flatMap((result) => result.content.quizzes),
        ],
        questions: snapshot.contentV2.questions,
        issues: [...snapshot.contentV2.issues, ...loaded.flatMap((result) => result.content.issues)],
      });
      setSyncPreviewOpen(true);
    } catch (error) {
      toast.show({ title: copy.publishFailed, description: String(error), variant: "error" });
    } finally {
      setLoadingSyncPreview(false);
    }
  };
  const batch = (state: MarketplaceTopicState) => runButtonAction(`batch-market-${state}`, async () => {
    const records = (isContest ? snapshot.contentV2.quizzes.filter((item) => item.topicId === selectedContest?.id) : snapshot.contentV2.topics)
      .filter((item) => state !== "listed" || marketplaceTopicState(item.marketplace) === "unlisted");
    if (records.length) {
      const result = await managerApi.setContentV2MarketplaceState(isContest ? "quizzes" : "topics", records.map((item: { id: string }) => item.id), state, selectedContest?.id);
      onSnapshotChange(applyMarketplaceStateUpdate(snapshot, result));
    }
    toast.show({ title: copy.batchUpdated, description: copy.batchUpdatedDescription.replace("{count}", String(records.length)).replace("{state}", copy.states[state]) });
  });
  if (!topicMode) return null;
  const items = [
    { id: "create", label: isContest ? "Create quiz" : "Create topic", icon: Plus, onSelect: () => isContest ? setQuizDialog("create") : setContestDialog("create") },
    ...(!isContest && allLegacyQuizCount > 0 ? [{ id: "migrate-all", label: `Migrate all ${allLegacyQuizCount}`, icon: RefreshCw, onSelect: () => void migrateAllLegacyQuizzes() }] : []),
    ...(isContest && legacyQuizCount > 0 ? [{ id: "migrate", label: `Migrate ${legacyQuizCount}`, icon: RefreshCw, onSelect: () => void migrateLegacyQuizzes() }] : []),
    { id: "list-all", label: copy.listAll, onSelect: () => void batch("listed") },
    ...((isContest || topicsView === "list") ? [{ id: "unlist-all", label: copy.unlistAll, onSelect: () => void batch("unlisted") }] : []),
    ...(!isContest ? [{ id: "sync", label: sync.label, icon: RefreshCw, disabled: Boolean(sync.job) || loadingSyncPreview, onSelect: () => void openSyncPreview() }, { id: "view", label: topicsView === "tree" ? "Show list view" : "Show tree view", icon: topicsView === "tree" ? Rows3 : ListOrdered, onSelect: () => { const next = topicsView === "tree" ? "list" : "tree"; setTopicsView(next); try { localStorage.setItem("getgo-tools.topics-view", next); } catch { /* optional */ } } }] : []),
  ];
  return <>
    <ui.ControlGroup className="manager-topic-header-controls">
      <ManagerSearchInput
        label={isContest ? "Search quizzes" : "Search topics"}
        placeholder={isContest ? "Search quizzes…" : "Search topics…"}
      />
      {!isContest && <TopicFilterControls
        gradeOptions={topicGradeOptions}
        subjectOptions={topicSubjectOptions}
        grades={topicGrades}
        subjects={topicSubjects}
        gradeLabel={copy.filters.grades}
        subjectLabel={copy.filters.subjects}
        allGradesLabel={copy.filters.allGrades}
        allSubjectsLabel={copy.filters.allSubjects}
        onGradesChange={setTopicGrades}
        onSubjectsChange={setTopicSubjects}
      />}
    </ui.ControlGroup>
    <ui.ActionMenu label="More" disabled={Boolean(buttonAction)} items={items} />
    {syncPreviewOpen && <MarketplaceSyncDrawer
      topics={syncPreview?.topics ?? snapshot.contentV2.topics}
      quizzes={syncPreview?.quizzes ?? snapshot.contentV2.quizzes}
      locale={locale}
      busy={startingSync}
      onClose={() => { setSyncPreviewOpen(false); setSyncPreview(null); }}
      onSync={async (items) => {
        setStartingSync(true);
        const started = await sync.start(items);
        setStartingSync(false);
        if (started) setSyncPreviewOpen(false);
      }}
    />}
  </>;
}
