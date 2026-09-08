import { useMemo, useState, type FormEvent } from "react";
import { Camera, Edit3, Image as ImageIcon } from "lucide-react";
import * as ui from "../../../shared/ui";
import type { DesignOrientation, DesignPageRecord, DesignVariant, ScreenshotProject } from "../domain/screenshot-project";

const variants: DesignVariant[] = ["portrait-light", "portrait-dark", "landscape-light", "landscape-dark"];

function pages(project: ScreenshotProject): DesignPageRecord[] {
  const grouped = new Map<string, DesignPageRecord>();
  for (const screenshot of project.screenshots) {
    const page = grouped.get(screenshot.route) ?? {
      id: screenshot.route,
      name: screenshot.name,
      route: screenshot.route,
      screenshots: {},
      breakdowns: {},
    };
    page.name = screenshot.name;
    page.screenshots[`${screenshot.orientation}-${screenshot.theme}`] = screenshot;
    grouped.set(screenshot.route, page);
  }
  for (const page of grouped.values()) {
    page.breakdowns.portrait = project.pageBreakdowns[`${page.route}:portrait`];
    page.breakdowns.landscape = project.pageBreakdowns[`${page.route}:landscape`];
  }
  return [...grouped.values()].sort((a, b) => a.route.localeCompare(b.route));
}

export function DesignPageLibrary({ locale, project, onProjectChange, onOpenPage, onCapturePage }: { locale: "en" | "vi"; project: ScreenshotProject; onProjectChange(project: ScreenshotProject): void; onOpenPage(page: DesignPageRecord): void; onCapturePage(page: DesignPageRecord): void }) {
  const vi = locale === "vi";
  const [editing, setEditing] = useState<DesignPageRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<ui.FormValues>({});
  const rows = useMemo(() => pages(project), [project]);
  const open = (page: DesignPageRecord) => {
    setValues({
      portraitSummary: page.breakdowns.portrait?.summary ?? "",
      portraitDefinition: page.breakdowns.portrait?.definition ? JSON.stringify(page.breakdowns.portrait.definition, null, 2) : "{}",
      landscapeSummary: page.breakdowns.landscape?.summary ?? "",
      landscapeDefinition: page.breakdowns.landscape?.definition ? JSON.stringify(page.breakdowns.landscape.definition, null, 2) : "{}",
    });
    setError(null);
    setEditing(page);
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    setBusy(true); setError(null);
    try {
      let next = project;
      for (const orientation of ["portrait", "landscape"] as DesignOrientation[]) {
        const raw = String(values[`${orientation}Definition`] ?? "{}").trim();
        const definition = raw ? JSON.parse(raw) as Record<string, unknown> : null;
        next = await window.getgo.updatePageBreakdown(project.id, {
          route: editing.route,
          orientation,
          summary: String(values[`${orientation}Summary`] ?? ""),
          definition,
        });
      }
      onProjectChange(next); setEditing(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };
  const columns = useMemo<ui.DataColumn<DesignPageRecord>[]>(() => [
    { key: "page", title: vi ? "Trang" : "Page", render: page => <span className="screenshot-project-cell"><strong>{page.name}</strong><small>{page.route}</small></span> },
    ...variants.map(variant => ({ key: variant, title: variant.replace("-", " · "), width: 118, align: "center" as const, render: (page: DesignPageRecord) => {
      const screenshot = page.screenshots[variant];
      return screenshot ? <ui.Image className="design-page-variant" src={screenshot.previewDataUrl} alt={`${page.name} ${variant}`} /> : <span className="design-page-missing"><ImageIcon />—</span>;
    } })),
    { key: "definition", title: vi ? "Định nghĩa" : "Definition", width: 130, render: page => `${Number(Boolean(page.breakdowns.portrait)) + Number(Boolean(page.breakdowns.landscape))}/2` },
    { key: "actions", title: "", width: 88, role: "actions" as const, render: page => <span className="screenshot-table-actions"><ui.TableActionButton variant="icon" icon={<Camera />} aria-label={vi ? "Chụp màn hình" : "Capture screenshot"} title={vi ? "Chụp màn hình" : "Capture screenshot"} onClick={event => { event.stopPropagation(); onCapturePage(page); }} /><ui.TableActionButton variant="icon" icon={<Edit3 />} aria-label={vi ? "Sửa định nghĩa" : "Edit definitions"} title={vi ? "Sửa định nghĩa" : "Edit definitions"} onClick={event => { event.stopPropagation(); open(page); }} /></span> },
  ], [onCapturePage, vi]);
  const fields: ui.FormSchema[] = [
    { section: vi ? "Bố cục dọc" : "Portrait layout", fields: [
      { name: "portraitSummary", type: "textarea", label: vi ? "Tóm tắt" : "Summary", rows: 3 },
      { name: "portraitDefinition", type: "textarea", label: "JSON", rows: 10 },
    ] },
    { section: vi ? "Bố cục ngang" : "Landscape layout", fields: [
      { name: "landscapeSummary", type: "textarea", label: vi ? "Tóm tắt" : "Summary", rows: 3 },
      { name: "landscapeDefinition", type: "textarea", label: "JSON", rows: 10 },
    ] },
  ];
  return <>
    <ui.Panel><ui.DataTable rows={rows} columns={columns} rowKey={page => page.id} ariaLabel={vi ? "Các trang thiết kế" : "Design pages"} emptyText={vi ? "Chưa có trang. Chụp một tuyến đường để tạo trang." : "No pages yet. Capture a route to create one."} onRowClick={onOpenPage} /></ui.Panel>
    {editing && <ui.DialogFrame presentation="modal" title={`${editing.name} · ${vi ? "Định nghĩa màn hình" : "Screen definitions"}`} busy={busy} error={error} submitLabel={vi ? "Lưu" : "Save"} onClose={() => setEditing(null)} onSubmit={save}><ui.Form fields={fields} values={values} onChange={(name, value) => setValues(current => ({ ...current, [name]: value }))} /></ui.DialogFrame>}
  </>;
}
