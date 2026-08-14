import { useCallback, useEffect, useState } from "react";
import { ListOrdered, Plus, RefreshCw, Search, Rows3 } from "lucide-react";
import type { BackgroundJob, RepositorySnapshot } from "../../../../shared/domain/models";
import { marketplaceTopicState, type MarketplaceTopicState } from "../../../../features/topics/domain/marketplace-topic-state";
import { ActionMenu } from "../../../../shared/ui";
import en from "../../../../shared/localization/en.json";
import vi from "../../../../shared/localization/vi.json";
import { MarketplaceSyncDrawer } from "../../components/MarketplaceSyncDrawer";

type Context = Record<string, any> & { snapshot: RepositorySnapshot };
const activeStatuses = new Set(["queued", "running", "paused"]);
const isSyncJob = (job: BackgroundJob) => job.kind === "publish" && job.name === "Sync marketplace · All topics" && activeStatuses.has(job.status);

function useMarketplaceSync(locale: Context["locale"], toast: Context["toast"]) {
  const copy = (locale === "vi" ? vi : en).marketplaceManager;
  const [job, setJob] = useState<BackgroundJob | null>(null);
  const load = useCallback(async () => setJob((await window.getgo.getBackgroundJobs()).jobs.find(isSyncJob) ?? null), []);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), job ? 500 : 2500);
    return () => window.clearInterval(timer);
  }, [job, load]);
  const start = async () => {
    try {
      setJob((await window.getgo.syncContentV2Marketplace()).jobs.find(isSyncJob) ?? null);
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
  const { allLegacyQuizCount, buttonAction, isContest, legacyQuizCount, locale, managerApi, migrateAllLegacyQuizzes, migrateLegacyQuizzes, onSnapshotChange, query, runButtonAction, selectedContest, setContestDialog, setQuery, setQuizDialog, setTopicsView, snapshot, toast, topicMode, topicsView } = context;
  const copy = (locale === "vi" ? vi : en).marketplaceManager;
  const sync = useMarketplaceSync(locale, toast);
  const [syncPreviewOpen, setSyncPreviewOpen] = useState(false);
  const [startingSync, setStartingSync] = useState(false);
  const batch = (state: MarketplaceTopicState) => runButtonAction(`batch-market-${state}`, async () => {
    const records = (isContest ? snapshot.contentV2.quizzes.filter((item) => item.topicId === selectedContest?.id) : snapshot.contentV2.topics)
      .filter((item) => state !== "listed" || marketplaceTopicState(item.marketplace) === "unlisted");
    if (records.length) onSnapshotChange(await managerApi.setContentV2MarketplaceState(isContest ? "quizzes" : "topics", records.map((item: { id: string }) => item.id), state, selectedContest?.id));
    toast.show({ title: copy.batchUpdated, description: copy.batchUpdatedDescription.replace("{count}", String(records.length)).replace("{state}", copy.states[state]) });
  });
  if (!topicMode) return null;
  const items = [
    { id: "create", label: isContest ? "Create quiz" : "Create topic", icon: Plus, onSelect: () => isContest ? setQuizDialog("create") : setContestDialog("create") },
    ...(!isContest && allLegacyQuizCount > 0 ? [{ id: "migrate-all", label: `Migrate all ${allLegacyQuizCount}`, icon: RefreshCw, onSelect: () => void migrateAllLegacyQuizzes() }] : []),
    ...(isContest && legacyQuizCount > 0 ? [{ id: "migrate", label: `Migrate ${legacyQuizCount}`, icon: RefreshCw, onSelect: () => void migrateLegacyQuizzes() }] : []),
    ...((isContest || topicsView === "list") ? [{ id: "list-all", label: copy.listAll, onSelect: () => void batch("listed") }, { id: "unlist-all", label: copy.unlistAll, onSelect: () => void batch("unlisted") }] : []),
    ...(!isContest ? [{ id: "sync", label: sync.label, icon: RefreshCw, disabled: Boolean(sync.job), onSelect: () => setSyncPreviewOpen(true) }, { id: "view", label: topicsView === "tree" ? "Show list view" : "Show tree view", icon: topicsView === "tree" ? Rows3 : ListOrdered, onSelect: () => { const next = topicsView === "tree" ? "list" : "tree"; setTopicsView(next); try { localStorage.setItem("getgo-tools.topics-view", next); } catch { /* optional */ } } }] : []),
  ];
  return <>
    <label className="manager-search ui-page-header-control"><Search size={17} /><input aria-label={isContest ? "Search quizzes" : "Search topics"} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={isContest ? "Search quizzes…" : "Search topics…"} /></label>
    <ActionMenu label="More" disabled={Boolean(buttonAction)} items={items} />
    {syncPreviewOpen && <MarketplaceSyncDrawer
      topics={snapshot.contentV2.topics}
      quizzes={snapshot.contentV2.quizzes}
      locale={locale}
      busy={startingSync}
      onClose={() => setSyncPreviewOpen(false)}
      onSync={async () => {
        setStartingSync(true);
        const started = await sync.start();
        setStartingSync(false);
        if (started) setSyncPreviewOpen(false);
      }}
    />}
  </>;
}
