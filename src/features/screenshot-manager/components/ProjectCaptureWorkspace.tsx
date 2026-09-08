import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import * as ui from "../../../shared/ui";
import type { DesignPageRecord, DesignVariant, ScreenshotProject } from "../domain/screenshot-project";
import { DevicePreview } from "./DevicePreview";

const variants: DesignVariant[] = ["landscape-light", "landscape-dark", "portrait-light", "portrait-dark"];

function projectPages(project: ScreenshotProject): DesignPageRecord[] {
  const pages = new Map<string, DesignPageRecord>();
  for (const screenshot of project.screenshots) {
    const page = pages.get(screenshot.route) ?? { id: screenshot.route, name: screenshot.name, route: screenshot.route, screenshots: {}, breakdowns: {} };
    page.name = screenshot.name;
    page.screenshots[`${screenshot.orientation}-${screenshot.theme}`] = screenshot;
    pages.set(page.route, page);
  }
  return [...pages.values()].sort((a, b) => a.route.localeCompare(b.route));
}

export function ProjectCaptureWorkspace({ locale, project, resetKey, onProjectChange }: {
  locale: "en" | "vi";
  project: ScreenshotProject;
  resetKey: number;
  onProjectChange(project: ScreenshotProject): void;
}) {
  const vi = locale === "vi";
  const pages = useMemo(() => projectPages(project), [project]);
  const [selectedRoute, setSelectedRoute] = useState<string | null>(pages[0]?.route ?? null);
  const [scale, setScale] = useState(1);
  const [capturedRoute, setCapturedRoute] = useState<string | null>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const selected = pages.find(page => page.route === selectedRoute) ?? pages[0];
  const columns = useMemo<ui.DataColumn<DesignPageRecord>[]>(() => [
    { key: "page", title: vi ? "Trang" : "Page", render: page => <span className="screenshot-project-cell"><strong>{page.name}</strong><small>{page.route}</small></span> },
    ...variants.map(variant => {
      const [orientation, theme] = variant.split("-");
      return { key: variant, title: <span className="capture-mode-heading"><strong>{orientation === "landscape" ? (vi ? "Ngang" : "Landscape") : (vi ? "Dọc" : "Portrait")}</strong><small>{theme === "dark" ? (vi ? "Tối" : "Dark") : (vi ? "Sáng" : "Light")}</small></span>, width: 88, align: "center" as const, render: (page: DesignPageRecord) => page.screenshots[variant] ? <ui.Image className="capture-slot-thumbnail" src={page.screenshots[variant]?.previewDataUrl} alt={`${page.name} ${variant}`} fit="cover" /> : <span className="capture-slot-empty">—</span> };
    }),
  ], [vi]);
  useEffect(() => {
    if (!capturedRoute || !pages.some(page => page.route === capturedRoute)) return;
    setSelectedRoute(capturedRoute);
    requestAnimationFrame(() => {
      const row = workspaceRef.current?.querySelector<HTMLElement>(`[data-row-key="${CSS.escape(capturedRoute)}"]`);
      row?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      setCapturedRoute(null);
    });
  }, [capturedRoute, pages]);
  if (!selected) return <ui.Panel><ui.PanelBody><strong>{vi ? "Chưa có trang" : "No pages yet"}</strong><p>{vi ? "Thêm ảnh có tuyến đường để bắt đầu." : "Add a routed screenshot to begin."}</p></ui.PanelBody></ui.Panel>;
  return <div ref={workspaceRef} className="screenshot-capture-workspace project-capture-workspace" style={{ "--screenshot-preview-width": `${Math.round(project.previewConfig.width * scale)}px` } as CSSProperties}>
    <aside className="screenshot-capture-library"><ui.DataTable rows={pages} columns={columns} rowKey={page => page.id} ariaLabel={vi ? "Danh sách trang" : "Page list"} emptyText={vi ? "Chưa có trang" : "No pages"} selectedRowKey={selected.route} onRowClick={page => setSelectedRoute(page.route)} /></aside>
    <div className="screenshot-device-workspace project-capture-preview">
      <DevicePreview locale={locale} project={project} requestedRoute={{ route: selected.route, key: selected.route === selectedRoute ? 1 : 0 }} resetKey={resetKey} onScaleChange={setScale} onProjectChange={onProjectChange} onCaptured={setCapturedRoute} />
    </div>
  </div>;
}
