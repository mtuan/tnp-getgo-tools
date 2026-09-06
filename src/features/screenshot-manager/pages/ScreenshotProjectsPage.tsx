import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, Calendar, FolderOpen, Image as ImageIcon, LayoutGrid, MonitorSmartphone, Network, Plus } from "lucide-react";
import * as ui from "../../../shared/ui";
import en from "../../../shared/localization/en.json";
import vi from "../../../shared/localization/vi.json";
import type { ClipboardScreenshot, ScreenshotMetadataInput, ScreenshotProject, ScreenshotProjectSummary, ScreenshotRecord } from "../domain/screenshot-project";
import { ScreenshotEditorDialog } from "../components/ScreenshotEditorDialog";
import { ScreenshotRouteMap } from "../components/ScreenshotRouteMap";
import { DevicePreview } from "../components/DevicePreview";

type DetailTab = "gallery" | "map" | "preview";
const parseRoute = (route: string) => {
  const match = /^\/screenshots\/([^/]+)(?:\/(gallery|map|preview))?\/?$/.exec(route.split("?")[0]);
  if (!match) return { projectId: null, tab: "gallery" as DetailTab };
  try { return { projectId: decodeURIComponent(match[1]), tab: match[2] === "map" ? "map" as const : match[2] === "preview" ? "preview" as const : "gallery" as const }; }
  catch { return { projectId: null, tab: "gallery" as DetailTab }; }
};
const detailRoute = (projectId: string, tab: DetailTab) => `/screenshots/${encodeURIComponent(projectId)}/${tab}`;
const formatDate = (value: string, locale: "en" | "vi") => new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

export function ScreenshotProjectsPage({ locale, initialRoute, onRouteChange }: { locale: "en" | "vi"; initialRoute: string; onRouteChange(route: string): void }) {
  const copy = (locale === "vi" ? vi : en).screenshotManager;
  const route = parseRoute(initialRoute);
  const [projects, setProjects] = useState<ScreenshotProjectSummary[]>([]);
  const [project, setProject] = useState<ScreenshotProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editor, setEditor] = useState<ScreenshotRecord | "paste" | null>(null);
  const [clipboard, setClipboard] = useState<ClipboardScreenshot>();
  const [projectValues, setProjectValues] = useState<ui.FormValues>({ name: "", description: "" });

  const load = useCallback(async () => {
    const list = await window.getgo.listScreenshotProjects();
    setProjects(list);
    setProject(route.projectId ? await window.getgo.loadScreenshotProject(route.projectId) : null);
  }, [route.projectId]);
  useEffect(() => { setLoading(true); void load().catch(cause => setError(cause instanceof Error ? cause.message : String(cause))).finally(() => setLoading(false)); }, [load]);

  const openPaste = useCallback(async () => {
    const image = await window.getgo.inspectClipboardScreenshot();
    if (!image) { setError(copy.clipboardMissing); return; }
    setError(null); setClipboard(image); setEditor("paste");
  }, [copy.clipboardMissing]);
  useEffect(() => {
    if (!project || route.tab !== "gallery" || editor) return;
    const paste = (event: ClipboardEvent) => {
      if ((event.target as HTMLElement | null)?.closest("input, textarea, [contenteditable=true]")) return;
      event.preventDefault(); void openPaste();
    };
    window.addEventListener("paste", paste);
    return () => window.removeEventListener("paste", paste);
  }, [editor, openPaste, project, route.tab]);

  const projectFields = useMemo<ui.FormSchema[]>(() => [
    { name: "name", type: "text", label: copy.name, required: true, maxLength: 120 },
    { name: "description", type: "textarea", label: copy.description, rows: 4, maxLength: 500 },
  ], [copy]);
  async function create(event: FormEvent) {
    event.preventDefault();
    if (!String(projectValues.name).trim()) return;
    setBusy(true); setError(null);
    try {
      const created = await window.getgo.createScreenshotProject({ name: String(projectValues.name), description: String(projectValues.description ?? "") });
      setCreating(false); setProjectValues({ name: "", description: "" }); onRouteChange(detailRoute(created.id, "gallery"));
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }
  async function saveScreenshot(input: ScreenshotMetadataInput) {
    if (!project || !editor) return;
    if (editor === "paste" && !clipboard) throw new Error(copy.clipboardMissing);
    setBusy(true);
    try {
      const next = editor === "paste" ? await window.getgo.addScreenshot(project.id, clipboard!.previewDataUrl, input) : await window.getgo.updateScreenshot(project.id, editor.id, input);
      setProject(next); setProjects(await window.getgo.listScreenshotProjects()); setEditor(null); setClipboard(undefined);
    } finally { setBusy(false); }
  }

  const columns = useMemo<ui.DataColumn<ScreenshotProjectSummary>[]>(() => [
    { key: "name", title: copy.project, render: item => <span className="screenshot-project-cell"><strong>{item.name}</strong><small>{item.description || copy.noDescription}</small></span>, sortValue: item => item.name },
    { key: "screenshots", title: copy.screenshots, width: 150, align: "center", render: item => item.screenshotCount, sortValue: item => item.screenshotCount },
    { key: "updated", title: copy.lastUpdated, width: 220, render: item => <span className="screenshot-date"><Calendar size={15} />{formatDate(item.updatedAt, locale)}</span>, sortValue: item => item.updatedAt },
  ], [copy, locale]);
  if (loading) return <ui.PageLoading label={copy.loading} />;
  const closeEditor = () => { setEditor(null); setClipboard(undefined); };

  return <div className="screenshot-manager-page">
    {!project ? <>
      <ui.PageHeader eyebrow={copy.eyebrow} title={copy.title} description={copy.pageDescription} actions={<ui.Button icon={<Plus />} variant="primary" onClick={() => setCreating(true)}>{copy.newProject}</ui.Button>} />
      {error && <ui.ErrorFrame message={error} />}
      <ui.Panel title={copy.projects} description={copy.projectsDescription}><ui.DataTable rows={projects} columns={columns} rowKey={item => item.id} ariaLabel={copy.projects} emptyText={copy.noProjects} defaultSort={{ key: "updated", direction: "desc" }} onRowClick={item => onRouteChange(detailRoute(item.id, "gallery"))} /></ui.Panel>
    </> : <>
      <ui.PageHeader eyebrow={copy.eyebrow} title={project.name} description={project.description || copy.noDescription} leading={<ui.Button icon={<ArrowLeft />} variant="icon" aria-label={copy.backToProjects} title={copy.backToProjects} onClick={() => onRouteChange("/screenshots")} />} actions={<ui.Button icon={<FolderOpen />} onClick={() => void window.getgo.showScreenshotProjectFolder(project.id)}>{copy.openFolder}</ui.Button>} />
      <ui.Tabs<DetailTab> className="contest-detail-tabs" variant="underline" ariaLabel={copy.viewMode} value={route.tab} onChange={tab => onRouteChange(detailRoute(project.id, tab))} items={[{ id: "gallery", label: copy.gallery, icon: <LayoutGrid /> }, { id: "map", label: copy.routeMap, icon: <Network /> }, { id: "preview", label: copy.devicePreview.tab, icon: <MonitorSmartphone /> }]} />
      {error && <ui.ErrorFrame message={error} />}
      <ui.TabPanels<DetailTab> value={route.tab} items={[
        { id: "gallery", content: <><div className="screenshot-gallery-toolbar"><span>{copy.pasteShortcut}</span><ui.Button variant="primary" onClick={() => void openPaste()}>{copy.pasteScreenshot}</ui.Button></div>{project.screenshots.length ? <div className="screenshot-gallery">{project.screenshots.map(record => <button className="screenshot-card" type="button" onClick={() => setEditor(record)} key={record.id}><ui.Image src={record.previewDataUrl} alt={record.name} fallback={<ImageIcon />} /><span><strong>{record.name}</strong><code>{record.route}</code><small>{record.width} × {record.height}</small></span></button>)}</div> : <div className="screenshot-empty screenshot-empty-workspace"><ImageIcon /><strong>{copy.noScreenshots}</strong><span>{copy.noScreenshotsDescription}</span></div>}</> },
        { id: "map", content: <ScreenshotRouteMap screenshots={project.screenshots} emptyTitle={copy.noRoutes} emptyDescription={copy.noRoutesDescription} onOpen={setEditor} /> },
        { id: "preview", content: <DevicePreview locale={locale} project={project} onProjectChange={next => { setProject(next); void window.getgo.listScreenshotProjects().then(setProjects); }} /> },
      ]} />
    </>}
    {creating && <ui.DialogFrame presentation="modal" title={copy.newProject} busy={busy} error={error} submitLabel={copy.create} onClose={() => setCreating(false)} onSubmit={create}><ui.Form fields={projectFields} values={projectValues} onChange={(name, value) => setProjectValues(current => ({ ...current, [name]: value }))} /></ui.DialogFrame>}
    {editor && <ScreenshotEditorDialog record={editor === "paste" ? undefined : editor} clipboard={clipboard} copy={copy} busy={busy} onClose={closeEditor} onSave={saveScreenshot} />}
  </div>;
}
