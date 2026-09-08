import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import * as ui from "../../../shared/ui";
import type { CapturedDomElement, DesignOrientation, ScreenshotAnalysisDocuments, ScreenshotPageAnalysis, ScreenshotProject, ScreenshotRecord } from "../domain/screenshot-project";

type Region = { id: string; name?: string; semanticRole?: string; meaning?: string; portrait?: { bounds?: Record<string, unknown> }; landscape?: { bounds?: Record<string, unknown> }; childElementIds?: string[] };
type Element = { id: string; parentRegionId: string; type?: string; content?: string; meaning?: string };

function pageStructure(page: ScreenshotPageAnalysis | undefined) {
  const structure = page?.definition.structure as { regionTree?: Region[]; elements?: Element[] } | undefined;
  return { regions: structure?.regionTree ?? [], elements: structure?.elements ?? [] };
}

function highlightStyle(region: Region | undefined, orientation: DesignOrientation) {
  if (!region) return undefined;
  const geometry = region[orientation]?.bounds ?? {};
  if (geometry.measurementStatus !== "verified" || geometry.rendered === false) return undefined;
  if (![geometry.x, geometry.y, geometry.width, geometry.height].every(value => typeof value === "number" && value >= 0 && value <= 1)) return undefined;
  return { left: `${Number(geometry.x) * 100}%`, top: `${Number(geometry.y) * 100}%`, width: `${Number(geometry.width) * 100}%`, height: `${Number(geometry.height) * 100}%` };
}

function domHighlightStyle(element: CapturedDomElement | undefined) {
  if (!element) return undefined;
  const source = element.normalizedBounds;
  const left = Math.max(0, source.x);
  const top = Math.max(0, source.y);
  const right = Math.min(1, source.x + source.width);
  const bottom = Math.min(1, source.y + source.height);
  if (![left, top, right, bottom].every(Number.isFinite) || right <= left || bottom <= top) return undefined;
  return { left: `${left * 100}%`, top: `${top * 100}%`, width: `${(right - left) * 100}%`, height: `${(bottom - top) * 100}%` };
}

function domLabel(element: CapturedDomElement) {
  return element.semantic?.label ?? "Unclassified element";
}

function domElementKey(element: CapturedDomElement) {
  return element.semantic?.confidence === "explicit" ? `semantic:${element.semantic.id}` : `selector:${element.selector}`;
}

function findDomElement(screenshot: ScreenshotRecord | undefined, key: string | null) {
  return key ? screenshot?.domSnapshot?.elements.find(element => domElementKey(element) === key) : undefined;
}

function domTree(screenshots: ScreenshotRecord[]): ui.TreeViewItem[] {
  type MergedNode = { element: CapturedDomElement; parentKey: string | null; childKeys: string[] };
  const nodes = new Map<string, MergedNode>();
  const rootKeys: string[] = [];
  for (const screenshot of screenshots) {
    const snapshot = screenshot.domSnapshot;
    if (!snapshot) continue;
    const byId = new Map(snapshot.elements.map(element => [element.id, element]));
    const semanticElements = snapshot.elements.filter(element => element.semantic?.confidence !== undefined && element.semantic.confidence !== "unclassified");
    const semanticIds = new Set(semanticElements.map(element => element.id));
    for (const element of semanticElements) {
      const key = domElementKey(element);
      let parentId = element.parentId;
      while (parentId && !semanticIds.has(parentId)) parentId = byId.get(parentId)?.parentId ?? null;
      const parent = parentId ? byId.get(parentId) : undefined;
      const parentKey = parent ? domElementKey(parent) : null;
      const existing = nodes.get(key);
      if (existing) {
        if (!existing.parentKey && parentKey) existing.parentKey = parentKey;
      } else {
        nodes.set(key, { element, parentKey, childKeys: [] });
      }
    }
  }
  for (const [key, node] of nodes) {
    const parent = node.parentKey ? nodes.get(node.parentKey) : undefined;
    if (parent) {
      if (!parent.childKeys.includes(key)) parent.childKeys.push(key);
    } else if (!rootKeys.includes(key)) rootKeys.push(key);
  }
  const make = (key: string): ui.TreeViewItem => {
    const node = nodes.get(key)!;
    const children = node.childKeys.map(make);
    return { id: `dom:${encodeURIComponent(key)}`, label: domLabel(node.element), kind: children.length ? "folder" : "document", children };
  };
  return rootKeys.map(make);
}

export function ScreenshotPageDetail({ locale, project, route, deleteScreenshotLabel, deleting = false, deletingScreenshotId, onDeleteScreenshot }: { locale: "en" | "vi"; project: ScreenshotProject; route: string; deleteScreenshotLabel: string; deleting?: boolean; deletingScreenshotId?: string | null; onDeleteScreenshot(screenshot: ScreenshotRecord): void }) {
  const vi = locale === "vi";
  const [documents, setDocuments] = useState<ScreenshotAnalysisDocuments | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => { setLoading(true); void window.getgo.loadScreenshotProjectAnalysis(project.id).then(setDocuments).catch(cause => setError(cause instanceof Error ? cause.message : String(cause))).finally(() => setLoading(false)); }, [project.id]);
  const analysis = documents?.pages.find(item => item.route === route);
  const screenshots = useMemo(() => project.screenshots.filter(item => item.route === route).sort((a, b) => `${a.orientation}-${a.theme}`.localeCompare(`${b.orientation}-${b.theme}`)), [project.screenshots, route]);
  const { regions, elements } = pageStructure(analysis);
  const referenceScreenshot = screenshots.find(item => item.orientation === "portrait" && item.theme === "light" && item.domSnapshot) ?? screenshots.find(item => item.domSnapshot);
  const hasCapturedDom = screenshots.some(screenshot => screenshot.domSnapshot?.elements.some(element => element.semantic?.confidence !== undefined && element.semantic.confidence !== "unclassified"));
  const selectedDomKey = selectedId?.startsWith("dom:") ? decodeURIComponent(selectedId.slice(4)) : null;
  const selectedDomElement = findDomElement(referenceScreenshot, selectedDomKey) ?? screenshots.map(screenshot => findDomElement(screenshot, selectedDomKey)).find(Boolean);
  const selectedRegion = selectedId?.startsWith("region:") ? regions.find(item => item.id === selectedId.slice(7)) : regions.find(region => region.id === elements.find(item => `element:${item.id}` === selectedId)?.parentRegionId);
  const documentedTree = [{ id: "page-root", label: vi ? "Cấu trúc đã mô tả" : "Documented structure", kind: "collection" as const, children: regions.map(region => ({ id: `branch:${region.id}`, label: region.name ?? region.id, kind: "folder" as const, meta: region.semanticRole, children: [{ id: `region:${region.id}`, label: vi ? "Vùng tổng thể" : "Region bounds", kind: "document" as const, meta: region.id }, ...elements.filter(element => element.parentRegionId === region.id).map(element => ({ id: `element:${element.id}`, label: element.content ?? element.id, kind: "file" as const, meta: element.type }))] })) }];
  const tree = hasCapturedDom ? [{ id: "captured-dom-root", label: vi ? "Cấu trúc trang đã đo" : "Measured page structure", kind: "collection" as const, children: domTree(screenshots) }] : documentedTree;
  if (loading) return <ui.PageLoading label={vi ? "Đang tải cấu trúc trang" : "Loading page structure"} />;
  if (error) return <ui.ErrorFrame message={error} />;
  return <div className="screenshot-page-detail-workspace">
    <section className="screenshot-page-comparison" aria-label={vi ? "Ảnh chụp trang" : "Page screenshots"}>
      <div className="screenshot-page-track">
        {screenshots.map((screenshot: ScreenshotRecord) => { const measuredElement = findDomElement(screenshot, selectedDomKey); const overlayStyle = selectedDomKey ? domHighlightStyle(measuredElement) : highlightStyle(selectedRegion, screenshot.orientation); const overlayLabel = measuredElement ? domLabel(measuredElement) : selectedRegion?.name ?? selectedRegion?.id; return <figure className="screenshot-page-figure" key={screenshot.id}>
          <figcaption><strong>{screenshot.orientation === "portrait" ? (vi ? "Dọc" : "Portrait") : (vi ? "Ngang" : "Landscape")}</strong><span>{screenshot.theme === "dark" ? (vi ? "Tối" : "Dark") : (vi ? "Sáng" : "Light")}</span></figcaption>
          <div className="screenshot-page-image-wrap">
            <img src={screenshot.previewDataUrl} alt={`${screenshot.name} · ${screenshot.orientation} · ${screenshot.theme}`} />
            <ui.Button className="screenshot-page-image-delete" variant="icon" color="danger" icon={<Trash2 />} loading={deletingScreenshotId === screenshot.id} disabled={deleting || Boolean(deletingScreenshotId)} aria-label={deleteScreenshotLabel} title={deleteScreenshotLabel} onClick={() => onDeleteScreenshot(screenshot)} />
            {overlayStyle && <div className="screenshot-page-highlight" style={overlayStyle}><span>{overlayLabel}</span></div>}
          </div>
        </figure>; })}
      </div>
    </section>
    <aside className="screenshot-page-tree-panel">
      <header><div><strong>{vi ? "Cấu trúc trang" : "Page layout"}</strong><span>{vi ? "Chọn vùng hoặc phần tử để đánh dấu" : "Select a region or element to highlight it"}</span></div></header>
      {hasCapturedDom || analysis ? <ui.TreeView ariaLabel={vi ? "Cây cấu trúc trang" : "Page layout tree"} items={tree} selectedId={selectedId} onSelect={setSelectedId} selectBranches={hasCapturedDom} /> : <div className="screenshot-empty"><strong>{vi ? "Chưa có dữ liệu cấu trúc" : "No structure data"}</strong></div>}
      {selectedDomElement && <div className="screenshot-page-selection-detail"><strong>{domLabel(selectedDomElement)}</strong>{selectedDomElement.semantic?.meaning && <span>{selectedDomElement.semantic.meaning}</span>}<span>{selectedDomElement.semantic?.kind}</span><span>{selectedDomElement.selector}</span><span>{`${Math.round(selectedDomElement.bounds.x)} × ${Math.round(selectedDomElement.bounds.y)} · ${Math.round(selectedDomElement.bounds.width)} × ${Math.round(selectedDomElement.bounds.height)} px`}</span><code>{selectedDomElement.positioning.display} · {selectedDomElement.positioning.position}</code></div>}
      {selectedRegion && <div className="screenshot-page-selection-detail"><strong>{selectedRegion.name ?? selectedRegion.id}</strong><span>{selectedRegion.meaning}</span>{!highlightStyle(selectedRegion, "portrait") && !highlightStyle(selectedRegion, "landscape") && <em>{vi ? "Thiếu tọa độ đã xác minh từ ảnh tham chiếu; không hiển thị vùng đánh dấu." : "Verified reference-image bounds are missing; no highlight is shown."}</em>}<code>{selectedRegion.id}</code></div>}
    </aside>
  </div>;
}
