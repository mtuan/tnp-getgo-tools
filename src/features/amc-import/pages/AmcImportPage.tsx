import { useCallback, useMemo, useState } from "react";
import { ExternalLink, FileDown, RefreshCw } from "lucide-react";
import { amcContestNames, amcPaperUrl, type AmcContestName, type AmcImportPreview } from "../domain/amc-import";
import { AmcSourceBrowser } from "../components/AmcSourceBrowser";
import { Button } from "../../../shared/ui/Button";
import { Checkbox } from "../../../shared/ui/Checkbox";
import { DataTable, type DataColumn } from "../../../shared/ui/DataTable";
import { Input } from "../../../shared/ui/Input";
import { PageHeader } from "../../../shared/ui/PageHeader";
import { Panel, PanelBody } from "../../../shared/ui/Panel";
import { ProcessingOverlay } from "../../../shared/ui/ProcessingOverlay";
import { Select } from "../../../shared/ui/Select";
import { StatusBadge } from "../../../shared/ui/StatusBadge";
import { useToast } from "../../../shared/ui/Toast";

type Locale = "en" | "vi";

export function AmcImportPage({ locale, onOpenQuiz }: { locale: Locale; onOpenQuiz(route: string): void }) {
  const vi = locale === "vi";
  const toast = useToast();
  const [contest, setContest] = useState<AmcContestName>("AMC 8");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [preview, setPreview] = useState<AmcImportPreview | null>(null);
  const [busy, setBusy] = useState<"discover" | "preview" | "import" | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [available, setAvailable] = useState<Array<{ contest: AmcContestName; year: number }>>([]);
  const [sourceSessionReady, setSourceSessionReady] = useState(false);
  const onSourceSessionChange = useCallback((ready: boolean) => setSourceSessionReady(ready), []);

  const fail = (cause: unknown) => toast.show({
    title: vi ? "Không thể nhập dữ liệu AMC" : "AMC import failed",
    description: cause instanceof Error ? cause.message : String(cause), variant: "error",
  });
  const discover = async () => {
    setBusy("discover");
    try {
      const entries = await window.getgo.discoverAmcArchive();
      setAvailable(entries);
      const first = entries.find((entry) => entry.contest === contest) ?? entries[0];
      if (first) { setContest(first.contest); setYear(String(first.year)); }
      toast.show({ title: vi ? "Đã tải danh mục AMC" : "AMC archive loaded", description: vi ? `${entries.length} đề thi có sẵn.` : `${entries.length} available papers found.` });
    } catch (cause) { fail(cause); } finally { setBusy(null); }
  };
  const loadPreview = async () => {
    const numericYear = Number(year);
    if (!Number.isInteger(numericYear) || numericYear < 1950 || numericYear > 2100) { fail(new Error(vi ? "Nhập năm AMC hợp lệ." : "Enter a valid AMC year.")); return; }
    setBusy("preview"); setPreview(null);
    try { setPreview(await window.getgo.previewAmcPaper(contest, numericYear)); }
    catch (cause) { fail(cause); } finally { setBusy(null); }
  };
  const importPaper = async () => {
    if (!preview) return;
    setBusy("import");
    try {
      const result = await window.getgo.importAmcPaper(preview, overwrite);
      toast.show({ title: vi ? "Đã nhập đề AMC" : "AMC paper imported", description: vi ? `${result.questionCount} câu hỏi và toàn bộ lời giải đã được lưu.` : `${result.questionCount} questions and all solutions were saved.` });
      onOpenQuiz(result.route);
    } catch (cause) { fail(cause); } finally { setBusy(null); }
  };
  const columns = useMemo<DataColumn<AmcImportPreview["questions"][number]>[]>(() => [
    { key: "number", title: vi ? "Câu" : "Problem", width: 86, sortValue: (row) => row.number, render: (row) => <strong>#{row.number}</strong> },
    { key: "problem", title: vi ? "Nội dung" : "Question", render: (row) => <span className="amc-import-question-copy">{row.text}</span> },
    { key: "answer", title: vi ? "Đáp án" : "Answer", width: 100, render: (row) => row.correct ? <StatusBadge tone="success">{row.correct}</StatusBadge> : <StatusBadge tone="warning">{vi ? "Kiểm tra" : "Review"}</StatusBadge> },
    { key: "solutions", title: vi ? "Lời giải" : "Solutions", width: 105, sortValue: (row) => row.solutions.length, render: (row) => <StatusBadge tone={row.solutions.length ? "info" : "danger"}>{row.solutions.length}</StatusBadge> },
    { key: "source", title: "AoPS", width: 72, align: "center", render: (row) => <button type="button" className="amc-import-source-link" onClick={() => void window.getgo.openExternal(row.sourceUrl)} aria-label={`${vi ? "Mở nguồn câu" : "Open source problem"} ${row.number}`}><ExternalLink size={16} /></button> },
  ], [vi]);
  const yearOptions = available.filter((entry) => entry.contest === contest);

  return <div className="amc-import-page">
    <PageHeader eyebrow={vi ? "Công cụ khác" : "Other Tools"} title={vi ? "Nhập đề AMC từ AoPS" : "AoPS AMC importer"} description={vi ? "Xem trước và nhập chủ đề, đề thi, câu hỏi cùng toàn bộ lời giải vào kho nội dung GetGo." : "Preview and import topics, papers, questions, and every solution into the GetGo content repository."} actions={<Button variant="secondary" loading={busy === "discover"} disabled={Boolean(busy)} onClick={() => void discover()}><RefreshCw size={16} />{vi ? "Tải danh mục" : "Load archive"}</Button>} />
    <Panel title={vi ? "Chọn đề thi" : "Choose a paper"} description={vi ? "Dữ liệu chỉ được ghi sau khi bạn kiểm tra bản xem trước và bấm Nhập." : "Nothing is written until you review the preview and choose Import."}>
      <PanelBody className="amc-import-picker">
        <label><span>{vi ? "Kỳ thi" : "Contest"}</span><Select value={contest} options={amcContestNames.map((value) => ({ value, label: value }))} disabled={Boolean(busy)} onValueChange={(value) => { setContest(value as AmcContestName); setPreview(null); }} /></label>
        <label><span>{vi ? "Năm" : "Year"}</span>{yearOptions.length ? <Select value={year} options={yearOptions.map((entry) => ({ value: String(entry.year), label: String(entry.year) }))} disabled={Boolean(busy)} onValueChange={(value) => { setYear(value); setPreview(null); }} /> : <Input type="number" min={1950} max={2100} value={year} disabled={Boolean(busy)} onChange={(event) => { setYear(event.target.value); setPreview(null); }} />}</label>
        <Button variant="primary" loading={busy === "preview"} disabled={Boolean(busy) || !sourceSessionReady} title={!sourceSessionReady ? (vi ? "Xác minh và kiểm tra phiên AoPS trước" : "Verify and test the AoPS session first") : undefined} onClick={() => void loadPreview()}><FileDown size={16} />{vi ? "Xem trước" : "Preview"}</Button>
      </PanelBody>
    </Panel>
    <AmcSourceBrowser locale={locale} paperUrl={amcPaperUrl(contest, Number(year) || new Date().getFullYear())} onSessionChange={onSourceSessionChange} />
    {preview && <Panel className="amc-import-preview" title={preview.quiz.title} description={`${preview.topic.title} · ${preview.questions.length} ${vi ? "câu hỏi" : "questions"}`} meta={<Button variant="secondary" onClick={() => void window.getgo.openExternal(preview.sourcePaperUrl)}>{vi ? "Mở trang nguồn" : "Open source"}<ExternalLink size={14} /></Button>}>
      {preview.warnings.length > 0 && <div className="amc-import-warnings" role="status"><strong>{vi ? "Cần kiểm tra" : "Review needed"}</strong><span>{preview.warnings.join(" ")}</span></div>}
      <DataTable rows={preview.questions} columns={columns} rowKey={(row) => row.id} ariaLabel={vi ? "Câu hỏi AMC đã trích xuất" : "Extracted AMC questions"} emptyText={vi ? "Không tìm thấy câu hỏi." : "No questions found."} horizontalScroll />
      <div className="amc-import-footer">
        <label className="amc-import-overwrite"><Checkbox checked={overwrite} disabled={Boolean(busy)} ariaLabel={vi ? "Ghi đè đề thi hiện có" : "Overwrite existing paper"} onCheckedChange={setOverwrite} /><span>{vi ? "Ghi đè bản ghi đã nhập nếu đề thi này đã tồn tại" : "Overwrite imported records if this paper already exists"}</span></label>
        <Button variant="primary" loading={busy === "import"} disabled={Boolean(busy)} onClick={() => void importPaper()}>{vi ? "Nhập vào GetGo" : "Import into GetGo"}</Button>
      </div>
    </Panel>}
    <ProcessingOverlay open={Boolean(busy)} showElapsed={busy === "preview"} title={busy === "preview" ? (vi ? "Đang trích xuất đề AMC" : "Extracting AMC paper") : busy === "import" ? (vi ? "Đang lưu vào GetGo" : "Saving to GetGo") : (vi ? "Đang tải danh mục AoPS" : "Loading AoPS archive")} description={busy === "preview" ? (vi ? "GetGo đang tải tuần tự từng câu hỏi và tự chờ khi AoPS giới hạn tốc độ. Quá trình có thể mất vài phút." : "GetGo is loading problems sequentially and automatically waiting when AoPS rate-limits requests. This can take a few minutes.") : undefined} />
  </div>;
}
