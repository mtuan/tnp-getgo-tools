import { useEffect, useMemo, useState } from "react";
import * as ui from "../../../shared/ui";
import type { DesignOrientation, ScreenshotAnalysisDocuments, ScreenshotPageAnalysis, ScreenshotProject, ScreenshotRecord } from "../domain/screenshot-project";

type Region = { id: string; name?: string; semanticRole?: string; meaning?: string; portrait?: { bounds?: Record<string, unknown> }; landscape?: { bounds?: Record<string, unknown> }; childElementIds?: string[] };
type Element = { id: string; parentRegionId: string; type?: string; content?: string; meaning?: string };

function pageStructure(page: ScreenshotPageAnalysis | undefined) {
  const structure = page?.definition.structure as { regionTree?: Region[]; elements?: Element[] } | undefined;
  return { regions: structure?.regionTree ?? [], elements: structure?.elements ?? [] };
}

function highlightStyle(region: Region | undefined, orientation: DesignOrientation, regions: Region[]) {
  if (!region) return undefined;
  const canonical = orientation === "portrait" ? { width: 393, height: 852 } : { width: 1440, height: 900 };
  const geometry = region[orientation]?.bounds ?? {};
  if (geometry.rendered === false) return undefined;
  const x = typeof geometry.x === "number" ? geometry.x : 0;
  const y = typeof geometry.y === "number" ? geometry.y : 0;
  const width = typeof geometry.width === "number" ? geometry.width : canonical.width;
  let height = typeof geometry.height === "number" ? geometry.height : 0;
  if (!height) {
    const index = regions.indexOf(region);
    const next = regions.slice(index + 1).map(item => item[orientation]?.bounds?.y).find(value => typeof value === "number") as number | undefined;
    height = Math.max(56, (next ?? canonical.height - (orientation === "portrait" ? 60 : 0)) - y - 8);
  }
  return { left: `${x / canonical.width * 100}%`, top: `${y / canonical.height * 100}%`, width: `${width / canonical.width * 100}%`, height: `${height / canonical.height * 100}%` };
}

export function ScreenshotPageDetail({ locale, project, route }: { locale: "en" | "vi"; project: ScreenshotProject; route: string }) {
  const vi = locale === "vi";
  const [documents, setDocuments] = useState<ScreenshotAnalysisDocuments | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => { setLoading(true); void window.getgo.loadScreenshotProjectAnalysis(project.id).then(setDocuments).catch(cause => setError(cause instanceof Error ? cause.message : String(cause))).finally(() => setLoading(false)); }, [project.id]);
  const analysis = documents?.pages.find(item => item.route === route);
  const screenshots = useMemo(() => project.screenshots.filter(item => item.route === route).sort((a, b) => `${a.orientation}-${a.theme}`.localeCompare(`${b.orientation}-${b.theme}`)), [project.screenshots, route]);
  const { regions, elements } = pageStructure(analysis);
  const selectedRegion = selectedId?.startsWith("region:") ? regions.find(item => item.id === selectedId.slice(7)) : regions.find(region => region.id === elements.find(item => `element:${item.id}` === selectedId)?.parentRegionId);
  const tree = [{ id: "page-root", label: vi ? "Khung trang" : "Page canvas", kind: "collection" as const, children: regions.map(region => ({ id: `branch:${region.id}`, label: region.name ?? region.id, kind: "folder" as const, meta: region.semanticRole, children: [{ id: `region:${region.id}`, label: vi ? "Vùng tổng thể" : "Region bounds", kind: "document" as const, meta: region.id }, ...elements.filter(element => element.parentRegionId === region.id).map(element => ({ id: `element:${element.id}`, label: element.content ?? element.id, kind: "file" as const, meta: element.type }))] })) }];
  if (loading) return <ui.PageLoading label={vi ? "Đang tải cấu trúc trang" : "Loading page structure"} />;
  if (error) return <ui.ErrorFrame message={error} />;
  return <div className="screenshot-page-detail-workspace">
    <section className="screenshot-page-comparison" aria-label={vi ? "Ảnh chụp trang" : "Page screenshots"}>
      <div className="screenshot-page-track">
        {screenshots.map((screenshot: ScreenshotRecord) => <figure className="screenshot-page-figure" key={screenshot.id}>
          <figcaption><strong>{screenshot.orientation === "portrait" ? (vi ? "Dọc" : "Portrait") : (vi ? "Ngang" : "Landscape")}</strong><span>{screenshot.theme === "dark" ? (vi ? "Tối" : "Dark") : (vi ? "Sáng" : "Light")}</span></figcaption>
          <div className="screenshot-page-image-wrap">
            <img src={screenshot.previewDataUrl} alt={`${screenshot.name} · ${screenshot.orientation} · ${screenshot.theme}`} />
            {selectedRegion && <div className="screenshot-page-highlight" style={highlightStyle(selectedRegion, screenshot.orientation, regions)}><span>{selectedRegion.name ?? selectedRegion.id}</span></div>}
          </div>
        </figure>)}
      </div>
    </section>
    <aside className="screenshot-page-tree-panel">
      <header><strong>{vi ? "Cấu trúc trang" : "Page layout"}</strong><span>{vi ? "Chọn vùng hoặc phần tử để đánh dấu" : "Select a region or element to highlight it"}</span></header>
      {analysis ? <ui.TreeView ariaLabel={vi ? "Cây cấu trúc trang" : "Page layout tree"} items={tree} selectedId={selectedId} onSelect={setSelectedId} /> : <div className="screenshot-empty"><strong>{vi ? "Chưa có phân tích" : "No analysis"}</strong></div>}
      {selectedRegion && <div className="screenshot-page-selection-detail"><strong>{selectedRegion.name ?? selectedRegion.id}</strong><span>{selectedRegion.meaning}</span><code>{selectedRegion.id}</code></div>}
    </aside>
  </div>;
}
