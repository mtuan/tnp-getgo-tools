import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, Calendar, FolderOpen, Maximize2, Minimize2, Plus, RectangleHorizontal, RectangleVertical, Settings, Trash2 } from "lucide-react";
import * as ui from "../../../shared/ui";
import en from "../../../shared/localization/en.json";
import vi from "../../../shared/localization/vi.json";
import type { ClipboardScreenshot, ScreenshotMetadataInput, ScreenshotProject, ScreenshotProjectSummary, ScreenshotRecord } from "../domain/screenshot-project";
import { ScreenshotEditorDialog } from "../components/ScreenshotEditorDialog";
import { ProjectCaptureWorkspace } from "../components/ProjectCaptureWorkspace";

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
  const match = /^\/screenshots\/([^/]+)/.exec(route.split("?")[0]);
  if (!match) return { projectId: null };
  try { return { projectId: decodeURIComponent(match[1]) }; }
  catch { return { projectId: null }; }
};
const detailRoute = (projectId: string) => `/screenshots/${encodeURIComponent(projectId)}/capture`;
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
  const [configuring, setConfiguring] = useState(false);
  const [editor, setEditor] = useState<ScreenshotRecord | "paste" | null>(null);
  const [clipboard, setClipboard] = useState<ClipboardScreenshot>();
  const [previewResetKey, setPreviewResetKey] = useState(0);
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
    if (!project || busy) return;
    const size = captureSizes[orientation];
    if (project.previewConfig.width === size.width && project.previewConfig.height === size.height) return;
    setBusy(true); setError(null);
    try {
      setProject(await window.getgo.updateScreenshotProject(project.id, {
        name: project.name,
        description: project.description,
        instructions: project.instructions,
        previewConfig: { ...project.previewConfig, ...size, sizeMode: "fit" },
      }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
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
    </> : <>
      <ui.PageHeader eyebrow={copy.eyebrow} title={project.name} description={project.description || copy.noDescription} leading={<ui.Button icon={<ArrowLeft />} variant="icon" aria-label={copy.backToProjects} title={copy.backToProjects} onClick={() => onRouteChange("/screenshots")} />} actions={<ui.ControlGroup><ui.Button icon={<RectangleVertical />} variant={project.previewConfig.width < project.previewConfig.height ? "primary" : "secondary"} disabled={busy} onClick={() => void setCaptureOrientation("portrait")}>{locale === "vi" ? "Dọc" : "Portrait"}</ui.Button><ui.Button icon={<RectangleHorizontal />} variant={project.previewConfig.width > project.previewConfig.height ? "primary" : "secondary"} disabled={busy} onClick={() => void setCaptureOrientation("landscape")}>{locale === "vi" ? "Ngang" : "Landscape"}</ui.Button><ui.ActionMenu label={copy.more} disabled={busy} items={[{ id: "size-mode", label: project.previewConfig.sizeMode === "fit" ? copy.useDefaultSize : copy.useAutoFit, icon: project.previewConfig.sizeMode === "fit" ? Maximize2 : Minimize2, onSelect: () => void togglePreviewSizeMode() }, { id: "clear", label: copy.clearData, icon: Trash2, color: "danger", onSelect: () => void clearData() }]} /><ui.Button icon={<Settings />} onClick={openProjectConfig}>{copy.projectConfig}</ui.Button><ui.Button icon={<FolderOpen />} onClick={() => void window.getgo.showScreenshotProjectFolder(project.id)}>{copy.openFolder}</ui.Button></ui.ControlGroup>} />
      {error && <ui.ErrorFrame message={error} />}
      <ProjectCaptureWorkspace locale={locale} project={project} resetKey={previewResetKey} onProjectChange={next => { setProject(next); void window.getgo.listScreenshotProjects().then(setProjects); }} />
    </>}
    {creating && <ui.DialogFrame presentation="modal" title={copy.newProject} busy={busy} error={error} submitLabel={copy.create} onClose={() => setCreating(false)} onSubmit={create}><ui.Form fields={projectFields} values={projectValues} onChange={changeProjectValue} /></ui.DialogFrame>}
    {configuring && <ui.DialogFrame presentation="modal" title={copy.projectConfig} busy={busy} error={error} submitLabel={copy.save} onClose={() => setConfiguring(false)} onSubmit={saveProject}><ui.Form fields={projectFields} values={projectValues} onChange={changeProjectValue} /></ui.DialogFrame>}
    {editor && <ScreenshotEditorDialog record={editor === "paste" ? undefined : editor} clipboard={clipboard} copy={copy} busy={busy} onClose={closeEditor} onSave={saveScreenshot} />}
  </div>;
}
