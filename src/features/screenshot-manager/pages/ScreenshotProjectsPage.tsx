import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, Calendar, Camera, FileSearch, FolderOpen, Maximize2, Minimize2, Plus, RectangleHorizontal, RectangleVertical, Settings, Square, Trash2 } from "lucide-react";
import * as ui from "../../../shared/ui";
import en from "../../../shared/localization/en.json";
import vi from "../../../shared/localization/vi.json";
import type { ClipboardScreenshot, ScreenshotAnalysisDocuments, ScreenshotMetadataInput, ScreenshotProject, ScreenshotProjectSummary, ScreenshotRecord } from "../domain/screenshot-project";
import { ScreenshotEditorDialog } from "../components/ScreenshotEditorDialog";
import { ProjectCaptureWorkspace, type ProjectCaptureWorkspaceHandle } from "../components/ProjectCaptureWorkspace";
import type { AutomaticCaptureProgress } from "../components/DevicePreview";
import { ScreenshotAnalysisDialog } from "../components/ScreenshotAnalysisDialog";
import { ScreenshotPageDetail } from "../components/ScreenshotPageDetail";

const previewPresets = [
  { value: "iphone-se", label: "iPhone SE · 375 × 667", width: 375, height: 667 },
  { value: "iphone-15", label: "iPhone 15 · 393 × 852", width: 393, height: 852 },
  { value: "iphone-15-max", label: "iPhone 15 Pro Max · 430 × 932", width: 430, height: 932 },
  { value: "ipad-mini", label: "iPad mini · 768 × 1024", width: 768, height: 1024 },
  { value: "ipad-pro", label: "iPad Pro 12.9\" · 1024 × 1366", width: 1024, height: 1366 },
  { value: "desktop", label: "Desktop · 1280 × 800", width: 1280, height: 800 },
  { value: "custom", label: "Custom", width: 393, height: 852 },
];
const captureSizes = {
  portrait: { devicePreset: "iphone-15", width: 393, height: 852 },
  landscape: { devicePreset: "desktop", width: 1440, height: 900 },
} as const;
const parseRoute = (route: string) => {
  const parsed = new URL(route, "http://getgo.local");
  const match = /^\/screenshots\/([^/]+)(?:\/(capture|page))?\/?$/.exec(parsed.pathname);
  if (!match) return { projectId: null, pageRoute: null };
  try { return { projectId: decodeURIComponent(match[1]), pageRoute: match[2] === "page" ? parsed.searchParams.get("route") : null }; }
  catch { return { projectId: null, pageRoute: null }; }
};
const detailRoute = (projectId: string) => `/screenshots/${encodeURIComponent(projectId)}/capture`;
const pageDetailRoute = (projectId: string, route: string) => `/screenshots/${encodeURIComponent(projectId)}/page?route=${encodeURIComponent(route)}`;
const formatDate = (value: string, locale: "en" | "vi") => new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

export function ScreenshotProjectsPage({ locale, initialRoute, onRouteChange }: { locale: "en" | "vi"; initialRoute: string; onRouteChange(route: string): void }) {
  const copy = (locale === "vi" ? vi : en).screenshotManager;
  const route = parseRoute(initialRoute);
  const [projects, setProjects] = useState<ScreenshotProjectSummary[]>([]);
  const [project, setProject] = useState<ScreenshotProject | null>(null);
  const projectRef = useRef<ScreenshotProject | null>(null);
  projectRef.current = project;
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [configuring, setConfiguring] = useState(false);
  const [editor, setEditor] = useState<ScreenshotRecord | "paste" | null>(null);
  const [clipboard, setClipboard] = useState<ClipboardScreenshot>();
  const [previewResetKey, setPreviewResetKey] = useState(0);
  const [analysis, setAnalysis] = useState<ScreenshotAnalysisDocuments | null>(null);
  const [automaticCapture, setAutomaticCapture] = useState<AutomaticCaptureProgress | null>(null);
  const captureWorkspaceRef = useRef<ProjectCaptureWorkspaceHandle>(null);
  const [projectValues, setProjectValues] = useState<ui.FormValues>({ name: "", description: "", baseUrl: "http://localhost:5173", devicePreset: "iphone-15", width: 393, height: 852 });
  const toast = ui.useToast();

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
    if (!project || editor) return;
    const paste = (event: ClipboardEvent) => {
      if ((event.target as HTMLElement | null)?.closest("input, textarea, [contenteditable=true]")) return;
      event.preventDefault(); void openPaste();
    };
    window.addEventListener("paste", paste);
    return () => window.removeEventListener("paste", paste);
  }, [editor, openPaste, project]);

  const projectFields = useMemo<ui.FormSchema[]>(() => [
    { name: "name", type: "text", label: copy.name, required: true, maxLength: 120 },
    { name: "description", type: "textarea", label: copy.description, rows: 4, maxLength: 500 },
    { name: "instructions", type: "textarea", label: locale === "vi" ? "Hướng dẫn thiết kế dùng chung" : "Shared design instructions", rows: 8 },
    { section: copy.previewConfig, fields: [
      { name: "baseUrl", type: "url", label: copy.baseUrl, required: true, placeholder: "http://localhost:5173" },
      { name: "devicePreset", type: "select", label: copy.devicePreview.device, options: previewPresets, presentation: "dropdown" },
      [{ name: "width", type: "number", label: copy.devicePreview.width, required: true, min: 240, max: 2560 }, { name: "height", type: "number", label: copy.devicePreview.height, required: true, min: 320, max: 2560 }],
    ] },
  ], [copy, locale]);
  const projectInput = () => ({ name: String(projectValues.name), description: String(projectValues.description ?? ""), instructions: String(projectValues.instructions ?? ""), previewConfig: { baseUrl: String(projectValues.baseUrl), devicePreset: String(projectValues.devicePreset), width: Number(projectValues.width), height: Number(projectValues.height), sizeMode: project?.previewConfig.sizeMode ?? "fit" as const } });
  const changeProjectValue = (name: string, value: unknown) => {
    setProjectValues(current => {
      if (name !== "devicePreset") return { ...current, [name]: value };
      const preset = previewPresets.find(item => item.value === value);
      return preset && preset.value !== "custom" ? { ...current, devicePreset: value, width: preset.width, height: preset.height } : { ...current, devicePreset: value };
    });
  };
  async function create(event: FormEvent) {
    event.preventDefault();
    if (!String(projectValues.name).trim()) return;
    setBusy(true); setError(null);
    try {
      const created = await window.getgo.createScreenshotProject(projectInput());
      setCreating(false); setProjectValues({ name: "", description: "", instructions: "", baseUrl: "http://localhost:5173", devicePreset: "iphone-15", width: 393, height: 852 }); onRouteChange(detailRoute(created.id));
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }
  async function saveProject(event: FormEvent) {
    event.preventDefault();
    if (!project) return;
    setBusy(true); setError(null);
    try {
      const next = await window.getgo.updateScreenshotProject(project.id, projectInput());
      setProject(next); setProjects(await window.getgo.listScreenshotProjects()); setConfiguring(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }
  const openProjectConfig = () => {
    if (!project) return;
    setProjectValues({ name: project.name, description: project.description, instructions: project.instructions, baseUrl: project.previewConfig.baseUrl, devicePreset: project.previewConfig.devicePreset, width: project.previewConfig.width, height: project.previewConfig.height });
    setConfiguring(true);
  };
  async function saveScreenshot(input: ScreenshotMetadataInput) {
    if (!project || !editor) return;
    if (editor === "paste" && !clipboard) throw new Error(copy.clipboardMissing);
    setBusy(true);
    try {
      const next = editor === "paste" ? await window.getgo.addScreenshot(project.id, clipboard!.previewDataUrl, input) : await window.getgo.updateScreenshot(project.id, editor.id, input);
      setProject(next); setProjects(await window.getgo.listScreenshotProjects()); setEditor(null); setClipboard(undefined);
    } finally { setBusy(false); }
  }
  async function clearData() {
    if (!project || !window.confirm(copy.clearScreenshotsConfirm)) return;
    setBusy(true); setError(null);
    try {
      const [next] = await Promise.all([
        window.getgo.clearScreenshots(project.id),
        window.getgo.clearPreviewBrowserData(),
      ]);
      setProject(next); setProjects(await window.getgo.listScreenshotProjects());
      setPreviewResetKey(Date.now());
      toast.show({ title: copy.dataCleared, description: copy.dataClearedDescription });
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }
  async function togglePreviewSizeMode() {
    if (!project) return;
    const sizeMode = project.previewConfig.sizeMode === "fit" ? "default" : "fit";
    setBusy(true); setError(null);
    try {
      const next = await window.getgo.updateScreenshotProject(project.id, {
        name: project.name,
        description: project.description,
        instructions: project.instructions,
        previewConfig: { ...project.previewConfig, sizeMode },
      });
      setProject(next);
      toast.show({ title: copy.previewSizeChanged, description: sizeMode === "fit" ? copy.autoFitSize : copy.defaultSize });
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }
  async function setCaptureOrientation(orientation: "portrait" | "landscape") {
    const activeProject = projectRef.current;
    if (!activeProject) return;
    const size = captureSizes[orientation];
    if (activeProject.previewConfig.width === size.width && activeProject.previewConfig.height === size.height) return;
    setBusy(true); setError(null);
    try {
      const next = await window.getgo.updateScreenshotProject(activeProject.id, {
        name: activeProject.name,
        description: activeProject.description,
        instructions: activeProject.instructions,
        previewConfig: { ...activeProject.previewConfig, ...size, sizeMode: "fit" },
      });
      projectRef.current = next;
      setProject(next);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }
  async function openAnalysis() {
    if (!project?.analysis) return;
    setBusy(true); setError(null);
    try { setAnalysis(await window.getgo.loadScreenshotProjectAnalysis(project.id)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }
  async function startAutomaticCapture() {
    if (!captureWorkspaceRef.current || busy || automaticCapture) return;
    setError(null);
    const routeCount = new Set(project!.screenshots.map(item => item.route)).size;
    setAutomaticCapture({ completed: 0, total: routeCount * 4, route: "", orientation: "portrait", theme: "light" });
    try {
      await captureWorkspaceRef.current.captureAll(setAutomaticCapture);
      toast.show({ title: copy.automaticCaptureComplete, description: copy.automaticCaptureCompleteDescription });
    } catch (cause) {
      if (cause instanceof Error && cause.message === "AUTOMATIC_CAPTURE_CANCELLED") {
        toast.show({ title: copy.automaticCaptureCancelled });
      } else setError(cause instanceof Error ? cause.message : String(cause));
    } finally { setAutomaticCapture(null); }
  }

  const columns = useMemo<ui.DataColumn<ScreenshotProjectSummary>[]>(() => [
    { key: "name", title: copy.project, render: item => <span className="screenshot-project-cell"><strong>{item.name}</strong><small>{item.description || copy.noDescription}</small></span>, sortValue: item => item.name },
    { key: "pages", title: locale === "vi" ? "Trang" : "Pages", width: 120, align: "center", render: item => item.pageCount, sortValue: item => item.pageCount },
    { key: "updated", title: copy.lastUpdated, width: 220, render: item => <span className="screenshot-date"><Calendar size={15} />{formatDate(item.updatedAt, locale)}</span>, sortValue: item => item.updatedAt },
  ], [copy, locale]);
  if (loading) return <ui.PageLoading label={copy.loading} />;
  const closeEditor = () => { setEditor(null); setClipboard(undefined); };

  return <div className="screenshot-manager-page">
    {!project ? <>
      <ui.PageHeader eyebrow={copy.eyebrow} title={copy.title} description={copy.pageDescription} actions={<ui.Button icon={<Plus />} variant="primary" onClick={() => setCreating(true)}>{copy.newProject}</ui.Button>} />
      {error && <ui.ErrorFrame message={error} />}
      <ui.Panel title={copy.projects} description={copy.projectsDescription}><ui.DataTable rows={projects} columns={columns} rowKey={item => item.id} ariaLabel={copy.projects} emptyText={copy.noProjects} defaultSort={{ key: "updated", direction: "desc" }} onRowClick={item => onRouteChange(detailRoute(item.id))} /></ui.Panel>
    </> : route.pageRoute ? <>
      <ui.PageHeader eyebrow={copy.eyebrow} title={project.screenshots.find(item => item.route === route.pageRoute)?.name ?? route.pageRoute} description={route.pageRoute} leading={<ui.Button icon={<ArrowLeft />} variant="icon" aria-label={copy.backToProjects} title={locale === "vi" ? "Quay lại ảnh chụp" : "Back to captures"} onClick={() => onRouteChange(detailRoute(project.id))} />} />
      <ScreenshotPageDetail locale={locale} project={project} route={route.pageRoute} />
    </> : <>
      <ui.PageHeader eyebrow={copy.eyebrow} title={project.name} description={project.description || copy.noDescription} leading={<ui.Button icon={<ArrowLeft />} variant="icon" aria-label={copy.backToProjects} title={copy.backToProjects} onClick={() => onRouteChange("/screenshots")} />} actions={<ui.ControlGroup><ui.Button icon={automaticCapture ? <Square /> : <Camera />} variant="primary" disabled={busy} onClick={() => automaticCapture ? captureWorkspaceRef.current?.cancelAutomaticCapture() : void startAutomaticCapture()}>{automaticCapture ? copy.stopAutomaticCapture.replace("{completed}", String(automaticCapture.completed)).replace("{total}", String(automaticCapture.total)) : copy.automaticCapture}</ui.Button><ui.Button icon={<RectangleVertical />} variant={project.previewConfig.width < project.previewConfig.height ? "primary" : "secondary"} disabled={busy || !!automaticCapture} onClick={() => void setCaptureOrientation("portrait")}>{locale === "vi" ? "Dọc" : "Portrait"}</ui.Button><ui.Button icon={<RectangleHorizontal />} variant={project.previewConfig.width > project.previewConfig.height ? "primary" : "secondary"} disabled={busy || !!automaticCapture} onClick={() => void setCaptureOrientation("landscape")}>{locale === "vi" ? "Ngang" : "Landscape"}</ui.Button><ui.ActionMenu label={copy.more} disabled={busy || !!automaticCapture} items={[{ id: "size-mode", label: project.previewConfig.sizeMode === "fit" ? copy.useDefaultSize : copy.useAutoFit, icon: project.previewConfig.sizeMode === "fit" ? Maximize2 : Minimize2, onSelect: () => void togglePreviewSizeMode() }, { id: "clear", label: copy.clearData, icon: Trash2, color: "danger", onSelect: () => void clearData() }]} /><ui.Button icon={<FileSearch />} disabled={!project.analysis || busy || !!automaticCapture} onClick={() => void openAnalysis()}>{locale === "vi" ? "Phân tích" : "Analysis"}</ui.Button><ui.Button icon={<Settings />} disabled={!!automaticCapture} onClick={openProjectConfig}>{copy.projectConfig}</ui.Button><ui.Button icon={<FolderOpen />} disabled={!!automaticCapture} onClick={() => void window.getgo.showScreenshotProjectFolder(project.id)}>{copy.openFolder}</ui.Button></ui.ControlGroup>} />
      {error && <ui.ErrorFrame message={error} />}
      <ProjectCaptureWorkspace ref={captureWorkspaceRef} locale={locale} project={project} resetKey={previewResetKey} onViewPage={pageRoute => onRouteChange(pageDetailRoute(project.id, pageRoute))} onProjectChange={next => { setProject(next); void window.getgo.listScreenshotProjects().then(setProjects); }} onOrientationChange={setCaptureOrientation} />
    </>}
    {creating && <ui.DialogFrame presentation="modal" title={copy.newProject} busy={busy} error={error} submitLabel={copy.create} onClose={() => setCreating(false)} onSubmit={create}><ui.Form fields={projectFields} values={projectValues} onChange={changeProjectValue} /></ui.DialogFrame>}
    {configuring && <ui.DialogFrame presentation="modal" title={copy.projectConfig} busy={busy} error={error} submitLabel={copy.save} onClose={() => setConfiguring(false)} onSubmit={saveProject}><ui.Form fields={projectFields} values={projectValues} onChange={changeProjectValue} /></ui.DialogFrame>}
    {editor && <ScreenshotEditorDialog record={editor === "paste" ? undefined : editor} clipboard={clipboard} copy={copy} busy={busy} onClose={closeEditor} onSave={saveScreenshot} />}
    {analysis && <ScreenshotAnalysisDialog locale={locale} documents={analysis} onClose={() => setAnalysis(null)} />}
  </div>;
}
