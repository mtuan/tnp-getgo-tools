import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Globe2, Play, RefreshCw } from "lucide-react";
import * as ui from "../../../shared/ui";
import { amcPaperUrl, amcTopicId, type AmcImportDashboard, type AmcPaperImportProgress, type AmcTopicImportProgress, type StartAmcImportInput } from "../domain/amc-import";
import { AmcSourceBrowser } from "../components/AmcSourceBrowser";
import type { BackgroundJob } from "../../../shared/domain/models";
import { BackgroundJobsTable, type BackgroundJobAction } from "../../jobs/components/BackgroundJobsTable";

type Locale = "en" | "vi";
type DashboardRow = { kind: "topic"; topic: AmcTopicImportProgress } | { kind: "paper"; paper: AmcPaperImportProgress };
const statusTone = (status: AmcPaperImportProgress["status"]): ui.StatusBadgeTone => status === "imported" ? "success" : status === "parsed" ? "info" : status === "failed" ? "danger" : ["parsing", "importing"].includes(status) ? "primary" : "neutral";

export function AmcImportPage({ locale, onOpenQuiz }: { locale: Locale; onOpenQuiz(route: string): void }) {
  const vi = locale === "vi";
  const toast = ui.useToast();
  const [dashboard, setDashboard] = useState<AmcImportDashboard | null>(null);
  const [jobs, setJobs] = useState<BackgroundJob[]>([]);
  const [busyJob, setBusyJob] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [showBrowser, setShowBrowser] = useState(false);
  const [browserPaperUrl, setBrowserPaperUrl] = useState(amcPaperUrl("AMC 8", new Date().getFullYear()));
  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    setLoadError("");
    try {
      const [next, jobSnapshot] = await Promise.all([
        window.getgo.loadAmcImportDashboard(refresh),
        window.getgo.getBackgroundJobs(),
      ]);
      setDashboard(next);
      setJobs(jobSnapshot.jobs.filter((job) => job.kind === "amc-import"));
      const latestFailure = [...(next.logs ?? [])].reverse().find((entry) => entry.level === "error");
      if (!next.total && latestFailure) setLoadError(latestFailure.detail ?? latestFailure.message);
    }
    catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setLoadError(message);
      toast.show({ title: vi ? "Không thể tải danh mục AMC" : "Could not load the AMC archive", description: message, variant: "error" });
    }
    finally { setLoading(false); setRefreshing(false); }
  }, [toast, vi]);
  useEffect(() => { void load(); }, [load]);
  const activeJobs = jobs.filter((job) => ["queued", "running", "paused"].includes(job.status));
  useEffect(() => { const timer = window.setInterval(() => void load(), dashboard?.active || activeJobs.length ? 750 : 2_500); return () => window.clearInterval(timer); }, [activeJobs.length, dashboard?.active, load]);
  const start = (input: StartAmcImportInput) => {
    void window.getgo.startAmcImport(input).then((next) => {
      setDashboard(next);
      void window.getgo.getBackgroundJobs().then((snapshot) => setJobs(snapshot.jobs.filter((job) => job.kind === "amc-import")));
      toast.show({ title: vi ? "Đã thêm công việc nhập AMC" : "AMC import job queued", description: vi ? "Theo dõi tiến độ và nhật ký chi tiết trong trang Công việc." : "Track detailed progress and logs on the Jobs page.", variant: "success" });
    }).catch((cause) => { toast.show({ title: vi ? "Không thể thêm công việc AMC" : "Could not queue AMC import", description: cause instanceof Error ? cause.message : String(cause), variant: "error" }); void load(); });
  };
  const controlJob = async (job: BackgroundJob, action: BackgroundJobAction) => {
    setBusyJob(job.id);
    try {
      const snapshot = action === "pause" ? await window.getgo.pauseBackgroundJob(job.id)
        : action === "resume" ? await window.getgo.resumeBackgroundJob(job.id)
          : action === "cancel" ? await window.getgo.cancelBackgroundJob(job.id)
            : action === "retry" ? await window.getgo.retryBackgroundJob(job.id)
              : await window.getgo.deleteBackgroundJob(job.id);
      setJobs(snapshot.jobs.filter((item) => item.kind === "amc-import"));
    } finally { setBusyJob(null); }
  };
  const openVerification = (url?: string) => { if (url) setBrowserPaperUrl(url); setShowBrowser(true); };
  const rows = useMemo<ui.TreeDataRow<DashboardRow>[]>(() => dashboard?.topics.map((topic) => ({ row: { kind: "topic", topic }, children: topic.papers.map((paper) => ({ row: { kind: "paper", paper } })) })) ?? [], [dashboard]);
  const columns = useMemo<ui.DataColumn<DashboardRow>[]>(() => [
    { key: "name", title: vi ? "Chủ đề / Đề thi" : "Topic / Quiz", render: (row) => row.kind === "topic" ? <strong>{row.topic.contest}</strong> : <div className="amc-dashboard-paper-name"><strong>{row.paper.title}</strong><span>{row.paper.error ?? (row.paper.totalQuestions ? `${row.paper.processedQuestions}/${row.paper.totalQuestions} ${vi ? "câu đã phân tích" : "questions parsed"}` : row.paper.questionCount ? `${row.paper.questionCount} ${vi ? "câu" : "questions"}` : row.paper.url)}</span></div> },
    { key: "status", title: vi ? "Trạng thái" : "Status", width: 130, render: (row) => row.kind === "topic" ? <ui.StatusBadge tone={row.topic.remaining ? "warning" : "success"}>{row.topic.remaining ? (vi ? "Chưa xong" : "Incomplete") : (vi ? "Hoàn tất" : "Complete")}</ui.StatusBadge> : <ui.StatusBadge tone={statusTone(row.paper.status)}>{row.paper.status}</ui.StatusBadge> },
    { key: "parsed", title: vi ? "Đã phân tích" : "Parsed", width: 110, align: "right", render: (row) => {
      if (row.kind === "paper") return row.paper.totalQuestions ? `${row.paper.processedQuestions}/${row.paper.totalQuestions}` : "—";
      const processed = row.topic.papers.reduce((sum, paper) => sum + paper.processedQuestions, 0);
      const total = row.topic.papers.reduce((sum, paper) => sum + paper.totalQuestions, 0);
      return total ? `${processed}/${total}` : "—";
    } },
    { key: "imported", title: vi ? "Đã nhập" : "Imported", width: 110, align: "right", render: (row) => row.kind === "topic" ? `${row.topic.imported}/${row.topic.total}` : row.paper.imported ? "1/1" : "0/1" },
    { key: "remaining", title: vi ? "Còn lại" : "Remaining", width: 95, align: "right", render: (row) => row.kind === "topic" ? row.topic.remaining : row.paper.imported ? 0 : 1 },
    { key: "actions", title: "", width: 230, role: "actions", render: (row) => row.kind === "topic"
      ? <div className="amc-dashboard-row-actions"><ui.Button variant="primary" icon={<Play size={15} />} onClick={() => start({ scope: "topic", contest: row.topic.contest, overwrite: row.topic.remaining === 0 })}>{row.topic.remaining === 0 ? (vi ? "Nhập lại chủ đề" : "Re-import topic") : (vi ? "Nhập chủ đề" : "Import topic")}</ui.Button></div>
      : <div className="amc-dashboard-row-actions"><ui.Button variant="icon" icon={<Globe2 />} aria-label={vi ? "Mở trong trình duyệt nguồn" : "Open in source browser"} onClick={() => openVerification(row.paper.url)} />{row.paper.imported && <ui.Button variant="secondary" onClick={() => onOpenQuiz(`/topics/${amcTopicId(row.paper.contest)}/quizzes/${row.paper.id}`)}>{vi ? "Mở" : "Open"}</ui.Button>}<ui.Button variant="primary" icon={<Play size={15} />} onClick={() => start({ scope: "quiz", contest: row.paper.contest, year: row.paper.year, overwrite: row.paper.imported })}>{row.paper.imported ? (vi ? "Nhập lại" : "Re-import") : (vi ? "Nhập" : "Import")}</ui.Button></div> },
  ], [onOpenQuiz, vi]);
  if (loading) return <ui.PageLoading label={vi ? "Đang tải trạng thái nhập AMC" : "Loading AMC import status"} />;
  const current = dashboard?.active?.current;
  return <div className="amc-import-page amc-dashboard-page">
    <ui.PageHeader eyebrow={vi ? "Công cụ khác" : "Other Tools"} title={vi ? "Nhập đề AMC từ AoPS" : "AoPS AMC importer"} description={current ? `${vi ? "Đang xử lý" : "Processing"}: ${current}` : (vi ? "Theo dõi và nhập một đề thi, một chủ đề hoặc toàn bộ kho AMC." : "Track and import one quiz, one contest topic, or the complete AMC archive.")} actions={<><ui.Button variant="secondary" icon={<Globe2 size={16} />} onClick={() => setShowBrowser((value) => !value)}>{showBrowser ? (vi ? "Ẩn trình duyệt" : "Hide browser") : (vi ? "Xác minh AoPS" : "Verify AoPS")}</ui.Button><ui.Button variant="secondary" loading={refreshing} icon={<RefreshCw size={16} />} onClick={() => void load(true)}>{vi ? "Cập nhật danh mục" : "Refresh archive"}</ui.Button><ui.Button variant="primary" disabled={!dashboard?.total} icon={<Play size={16} />} onClick={() => start({ scope: "all", overwrite: dashboard?.remaining === 0 })}>{dashboard?.remaining === 0 && dashboard.total ? (vi ? "Nhập lại tất cả" : "Re-import all") : (vi ? "Nhập tất cả" : "Import all")}</ui.Button></>} />
    {showBrowser && <AmcSourceBrowser locale={locale} paperUrl={browserPaperUrl} />}
    <div className="amc-dashboard-summary"><ui.SummaryCard label={vi ? "Đề thi tìm thấy" : "Discovered quizzes"} value={dashboard?.total ?? 0} detail={dashboard?.archiveLoadedAt ? `${vi ? "Cập nhật" : "Updated"} ${new Date(dashboard.archiveLoadedAt).toLocaleString(locale)}` : (vi ? "Chưa tải danh mục" : "Archive not loaded")} /><ui.SummaryCard label={vi ? "Đã phân tích" : "Parsed"} value={`${dashboard?.parsed ?? 0}/${dashboard?.total ?? 0}`} detail={vi ? "Dữ liệu đã lưu vào bộ nhớ đệm" : "Question data cached"} /><ui.SummaryCard label={vi ? "Đã nhập" : "Imported"} value={`${dashboard?.imported ?? 0}/${dashboard?.total ?? 0}`} detail={vi ? "Có trong trang Chủ đề" : "Available in Topics"} /><ui.SummaryCard label={vi ? "Công việc còn lại" : "Remaining work"} value={dashboard?.remaining ?? 0} detail={vi ? "Đề thi chưa được nhập" : "Quizzes not imported"} /></div>
    {activeJobs.length > 0 && <ui.Panel title={vi ? "Công việc nhập đang chạy" : "Running import job"} description={vi ? "Trạng thái và tiến độ trực tiếp của công việc AMC." : "Live status and question-level progress for the AMC job."}>
      <BackgroundJobsTable locale={locale} ariaLabel={vi ? "Công việc nhập AMC đang chạy" : "Running AMC import job"} rows={activeJobs} busyJob={busyJob} emptyText="" onAction={(job, action) => void controlJob(job, action)} />
    </ui.Panel>}
    <ui.Panel title={vi ? "Tiến độ theo chủ đề" : "Progress by contest"} description={vi ? "Mở rộng một chủ đề để xem và nhập từng đề thi." : "Expand a contest to inspect and import individual quizzes."} meta={<ui.Button variant="secondary" icon={<ExternalLink size={14} />} onClick={() => void window.getgo.openExternal(dashboard?.sourceUrl ?? "https://artofproblemsolving.com")}>{vi ? "Trang nguồn" : "Source page"}</ui.Button>}>
      {!rows.length ? <div className="amc-dashboard-empty">
        <Globe2 size={30} aria-hidden="true" />
        <strong>{loadError ? (vi ? "Không thể phân tích danh mục AoPS" : "AoPS archive parsing failed") : (vi ? "Không tìm thấy đề thi" : "No quizzes were discovered")}</strong>
        <p>{loadError
          ? (vi ? "Xem lỗi bên dưới. Chỉ mở xác minh nếu AoPS thực sự hiển thị kiểm tra bảo mật, sau đó thử lại." : "Review the error below. Open verification only if AoPS actually shows a security check, then retry.")
          : (vi ? "Thử tải lại danh mục đề thi từ AoPS." : "Retry loading the contest archive from AoPS.")}</p>
        {loadError && <code>{loadError}</code>}
        <div className="amc-dashboard-empty-actions">
          {loadError && <ui.Button variant="secondary" icon={<Globe2 size={16} />} onClick={() => setShowBrowser(true)}>{vi ? "Mở trình duyệt AoPS" : "Open AoPS browser"}</ui.Button>}
          <ui.Button variant="primary" loading={refreshing} icon={<RefreshCw size={16} />} onClick={() => void load(true)}>{vi ? "Thử tải lại danh mục" : "Retry archive discovery"}</ui.Button>
        </div>
      </div> : <ui.TreeDataTable rows={rows} columns={columns} rowKey={(row) => row.kind === "topic" ? `topic:${row.topic.contest}` : `paper:${row.paper.id}`} ariaLabel={vi ? "Tiến độ nhập AMC" : "AMC import progress"} emptyText={vi ? "Không có đề thi." : "No quizzes."} defaultExpandedKeys={rows.slice(0, 1).map((item) => item.row.kind === "topic" ? `topic:${item.row.topic.contest}` : "")} horizontalScroll renderIdentity={(row, _depth, toggle) => <span className="amc-dashboard-identity">{toggle}{columns[0].render(row, 0)}</span>} />}
    </ui.Panel>
    <ui.Panel title={vi ? "Nhật ký hoạt động" : "Activity log"} description={vi ? "Các bước tải, phân tích và nhập gần nhất." : "Recent archive discovery, parsing, and import activity."}>
      <div className="amc-dashboard-log" aria-live="polite">
        {dashboard?.logs?.length ? [...dashboard.logs].reverse().map((entry, index) => <div className={`amc-dashboard-log-entry is-${entry.level}`} key={`${entry.at}:${index}`}>
          <time>{new Date(entry.at).toLocaleString(locale)}</time>
          <strong>{entry.message}</strong>
          {entry.detail && <code>{entry.detail}</code>}
        </div>) : <p>{vi ? "Chưa có hoạt động." : "No activity yet."}</p>}
      </div>
    </ui.Panel>
  </div>;
}
