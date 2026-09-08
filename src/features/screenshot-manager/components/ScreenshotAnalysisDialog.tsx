import { useMemo, useState, type FormEvent } from "react";
import * as ui from "../../../shared/ui";
import type { ScreenshotAnalysisDocuments } from "../domain/screenshot-project";

export function ScreenshotAnalysisDialog({ locale, documents, onClose }: { locale: "en" | "vi"; documents: ScreenshotAnalysisDocuments; onClose(): void }) {
  const vi = locale === "vi";
  const [view, setView] = useState<"rules" | "structures" | "page">("rules");
  const [route, setRoute] = useState(documents.pages[0]?.route ?? "");
  const page = documents.pages.find(item => item.route === route) ?? documents.pages[0];
  const options = useMemo(() => documents.pages.map(item => ({ value: item.route, label: `${item.name} · ${item.route}` })), [documents.pages]);
  const preventSubmit = (event: FormEvent) => event.preventDefault();
  return <ui.DialogFrame className="screenshot-analysis-dialog" presentation="drawer" title={vi ? "Phân tích giao diện" : "UI analysis"} busy={false} error={null} hideFooter onClose={onClose} onSubmit={preventSubmit}>
    <ui.Tabs value={view} onChange={value => setView(value as "rules" | "structures" | "page")} ariaLabel={vi ? "Tài liệu phân tích" : "Analysis documents"} items={[{ id: "rules", label: vi ? "Quy tắc chung" : "General rules" }, { id: "structures", label: vi ? "Cấu trúc dùng chung" : "Shared structures" }, { id: "page", label: vi ? "Bố cục trang" : "Page layouts" }]} />
    {view === "rules" ? <pre className="screenshot-analysis-document screenshot-analysis-markdown">{documents.generalRulesMarkdown}</pre> : view === "structures" ? <pre className="screenshot-analysis-document screenshot-analysis-json">{JSON.stringify(documents.structureLibrary, null, 2)}</pre> : <div className="screenshot-analysis-page-viewer">
      <ui.Select value={page?.route ?? ""} options={options} ariaLabel={vi ? "Chọn trang" : "Select page"} onValueChange={setRoute} />
      {page && <>
        <div className="screenshot-analysis-page-meta"><strong>{page.name}</strong><code>{page.route}</code><span>{page.sourceVariants.join(" · ")}</span></div>
        <pre className="screenshot-analysis-document screenshot-analysis-json">{JSON.stringify(page.definition, null, 2)}</pre>
      </>}
    </div>}
  </ui.DialogFrame>;
}
