import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react"
import { AlertTriangle, ArrowLeft, Check, CloudUpload, Copy, FolderOpen, LayoutDashboard, Library, LogIn, PanelLeftClose, PanelLeftOpen, RefreshCw, RotateCcw, Settings, type LucideIcon } from "lucide-react"
import type { AppSettings, ContentStatus, DeploymentStatus, EnvironmentReadiness, RepositorySnapshot } from "../core/models"
import { useAuth } from "./AuthContext"
import { AccountMenu } from "./AccountMenu"
import { GetGoIcon } from "./GetGoIcon"
import { PageTransition } from "./PageTransition"
import { Button } from "./ui/Button"
import { DialogFrame } from "./ui/DialogFrame"
import { PageHeader } from "./ui/PageHeader"
import { Panel } from "./ui/Panel"
import { SummaryCard } from "./ui/SummaryCard"
import { Select, type SelectOption } from "./ui/Select"
import { useToast } from "./ui/Toast"

const QuizManager = lazy(() => import("./QuizManager").then(module => ({ default: module.QuizManager })))
const PublishingPage = lazy(() => import("./PublishingPage").then(module => ({ default: module.PublishingPage })))

type View = "dashboard" | "quizzes" | "publishing" | "settings" | "not-found"
type NavigableView = Exclude<View, "not-found">
const lastRouteKey = "getgo-tools:last-route"
const sidebarCollapsedKey = "getgo-tools:sidebar-collapsed"
const readLastRoute = () => { try { return localStorage.getItem(lastRouteKey) || "/dashboard" } catch { return "/dashboard" } }
const readSidebarCollapsed = () => { try { return localStorage.getItem(sidebarCollapsedKey) === "true" } catch { return false } }
function viewFromRoute(route: string, snapshot?: RepositorySnapshot | null): View {
  const staticView = ["dashboard", "publishing", "settings"].find(value => route === `/${value}`)
  if (staticView) return staticView as NavigableView
  const parts = route.split("/").filter(Boolean).map(part => { try { return decodeURIComponent(part) } catch { return part } })
  if (parts[0] !== "quizzes" || parts[1] !== "contests") return "not-found"
  if (parts.length === 2) return "quizzes"
  const contestId = parts[2]
  if (!contestId || (snapshot && !snapshot.contests.some(contest => contest.id === contestId))) return "not-found"
  if (parts.length === 3) return "quizzes"
  if (parts[3] !== "quizzes" || !parts[4]) return "not-found"
  if (snapshot && !snapshot.quizzes.some(quiz => quiz.contest === contestId && quiz.id === parts[4])) return "not-found"
  if (parts.length === 5) return "quizzes"
  return parts.length === 7 && parts[5] === "questions" && Boolean(parts[6]) ? "quizzes" : "not-found"
}
const normalizedRoute = (route: string) => { const value = route.trim(); if (!value) return "/dashboard"; return value.startsWith("/") ? value : `/${value}` }
const nav: { id: NavigableView; label: string; icon: LucideIcon }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "quizzes", label: "Quizzes", icon: Library },
  { id: "publishing", label: "Publishing", icon: CloudUpload },
  { id: "settings", label: "Settings", icon: Settings },
]
const environmentOptions: SelectOption[] = [
  { value: "development", label: "Development" },
  { value: "staging", label: "Staging" },
  { value: "production", label: "Production" },
]
const aiProfileOptions: SelectOption[] = [
  { value: "thorough", label: "Thorough" },
  { value: "fast", label: "Fast" },
]

function Badge({ value }: { value: ContentStatus | DeploymentStatus }) {
  return <span className={`badge badge-${value}`}>{value.replace("-", " ")}</span>
}

export function App() {
  const toast = useToast()
  const auth = useAuth()
  const [initialRoute] = useState(readLastRoute)
  const [view, setView] = useState<View>(() => viewFromRoute(initialRoute))
  const [settings, setSettings] = useState<AppSettings>({ repositoryPath: null, environment: "staging", aiProfile: "thorough" })
  const [snapshot, setSnapshot] = useState<RepositorySnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [choosingRepository, setChoosingRepository] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [repositoryError, setRepositoryError] = useState<string | null>(null)
  const [currentRoute, setCurrentRoute] = useState(initialRoute)
  const [routeDraft, setRouteDraft] = useState(initialRoute)
  const [routeRequest, setRouteRequest] = useState({ route: initialRoute, key: 0 })
  const [routeCopied, setRouteCopied] = useState(false)
  const [environmentReadiness, setEnvironmentReadiness] = useState<EnvironmentReadiness | null>(null)
  const [checkingEnvironment, setCheckingEnvironment] = useState(false)
  const [savingAiProfile, setSavingAiProfile] = useState(false)
  const [restartingApp, setRestartingApp] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed)
  const [canNavigateBack, setCanNavigateBack] = useState(false)
  const environmentCheckId = useRef(0)
  const quizBackAction = useRef<(() => void) | null>(null)

  async function scan(path?: string, announce = false) {
    setLoading(true); setRepositoryError(null)
    try { setSnapshot(await window.getgo.scanRepository(path)); if (announce) toast.show({ title: "Repository refreshed", description: "Local contests and quizzes are up to date." }) }
    catch (cause) { const message = cause instanceof Error ? cause.message : String(cause); setRepositoryError(message); if (announce) toast.show({ title: "Refresh failed", description: message, variant: "error" }) }
    finally { setLoading(false) }
  }
  async function choose() {
    setChoosingRepository(true)
    try {
      const result = await window.getgo.chooseRepository()
      if (result) {
        setSnapshot(result)
        setSettings((s) => ({ ...s, repositoryPath: result.repositoryPath }))
        setRepositoryError(null)
        toast.show({ title: "Repository connected", description: result.repositoryPath })
      }
    } catch (cause) { const message = cause instanceof Error ? cause.message : String(cause); setRepositoryError(message) }
    finally { setChoosingRepository(false) }
  }
  async function changeEnvironment(environment: AppSettings["environment"]) {
    const next = await window.getgo.setEnvironment(environment)
    setSettings(next)
    setEnvironmentReadiness(null)
    setCheckingEnvironment(true)
    const checkId = ++environmentCheckId.current
    const readinessCheck = window.getgo.checkEnvironmentReadiness
    if (typeof readinessCheck !== "function") {
      await auth.refresh()
      if (checkId === environmentCheckId.current) setCheckingEnvironment(false)
      toast.show({ title: "Restart required", description: "Restart GetGo Tools to load environment readiness checks.", variant: "info" })
      return
    }
    let readiness: EnvironmentReadiness
    try { [, readiness] = await Promise.all([auth.refresh(), readinessCheck()]) }
    finally { if (checkId === environmentCheckId.current) setCheckingEnvironment(false) }
    if (checkId !== environmentCheckId.current) return
    setEnvironmentReadiness(readiness)
    if (readiness.ready) {
      toast.show({ title: "Environment ready", description: `${next.environment} is connected to ${readiness.projectId}.` })
      return
    }
    const issues = readiness.checks.filter(check => !check.ready).map(check => check.message)
    toast.show({ title: `${next.environment} is not ready`, description: issues.join(" "), variant: "error" })
  }
  async function changeAiProfile(profile: AppSettings["aiProfile"]) {
    setSavingAiProfile(true)
    try {
      const next = await window.getgo.setAiProfile(profile)
      setSettings(next)
      toast.show({ title: "AI profile updated", description: profile === "fast" ? "Fast uses a compact prompt and low reasoning." : "Thorough uses the full reference and medium reasoning." })
    } catch (cause) {
      toast.show({ title: "Could not update AI profile", description: cause instanceof Error ? cause.message : String(cause), variant: "error" })
    } finally { setSavingAiProfile(false) }
  }
  async function restartApp() {
    setRestartingApp(true)
    try {
      await window.getgo.restartApp()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      setRestartingApp(false)
      toast.show({ title: "Could not restart GetGo Tools", description: message, variant: "error" })
    }
  }
  useEffect(() => {
    window.getgo.getSettings().then((value) => {
      setSettings(value)
      if (typeof window.getgo.checkEnvironmentReadiness === "function") {
        const checkId = ++environmentCheckId.current
        setCheckingEnvironment(true)
        void window.getgo.checkEnvironmentReadiness().then(readiness => { if (checkId === environmentCheckId.current) setEnvironmentReadiness(readiness) }).finally(() => { if (checkId === environmentCheckId.current) setCheckingEnvironment(false) })
      }
      if (value.repositoryPath) return scan(value.repositoryPath)
      setLoading(false)
    }).catch((cause) => { setError(String(cause)); setLoading(false) })
  }, [])
  useEffect(() => { try { localStorage.setItem(lastRouteKey, currentRoute) } catch { /* Storage can be unavailable in hardened renderer sessions. */ } }, [currentRoute])
  useEffect(() => { setRouteDraft(currentRoute) }, [currentRoute])
  useEffect(() => { try { localStorage.setItem(sidebarCollapsedKey, String(sidebarCollapsed)) } catch { /* Storage can be unavailable in hardened renderer sessions. */ } }, [sidebarCollapsed])
  useEffect(() => {
    if (!routeCopied) return
    const timeout = window.setTimeout(() => setRouteCopied(false), 1400)
    return () => window.clearTimeout(timeout)
  }, [routeCopied])

  async function copyCurrentRoute() {
    try {
      await window.getgo.copyText(currentRoute)
      setRouteCopied(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }
  const updateQuizBackAction = useCallback((action: (() => void) | null) => {
    quizBackAction.current = action
    setCanNavigateBack(Boolean(action))
  }, [])
  useEffect(() => {
    if (!snapshot || view !== "quizzes" || viewFromRoute(currentRoute, snapshot) !== "not-found") return
    updateQuizBackAction(null)
    setView("not-found")
  }, [currentRoute, snapshot, updateQuizBackAction, view])
  function goToRoute(route: string) {
    const nextRoute = normalizedRoute(route)
    const nextView = viewFromRoute(nextRoute, snapshot)
    if (nextView !== "quizzes") updateQuizBackAction(null)
    setView(nextView)
    setCurrentRoute(nextRoute)
    setRouteRequest(request => ({ route: nextRoute, key: request.key + 1 }))
  }
  function refreshCurrentRoute() {
    setRouteDraft(currentRoute)
    setRouteRequest(request => ({ route: currentRoute, key: request.key + 1 }))
  }
  function navigate(view: NavigableView) {
    goToRoute(view === "quizzes" ? "/quizzes/contests" : `/${view}`)
  }

  function environmentSwitcher(className?: string) {
    const failedChecks = environmentReadiness?.checks.filter(check => !check.ready).map(check => check.message).join(" ")
    const statusLabel = checkingEnvironment
      ? `Checking ${settings.environment}`
      : environmentReadiness?.ready
        ? `${settings.environment} is ready`
        : environmentReadiness
          ? `${settings.environment} is not ready. ${failedChecks}`
          : `${settings.environment} status is unknown`
    const readinessClass = checkingEnvironment ? "environment-checking" : environmentReadiness?.ready ? "environment-ready" : environmentReadiness ? "environment-not-ready" : "environment-unknown"
    const selectColor = environmentReadiness?.ready ? "success" : environmentReadiness ? "danger" : "normal"
    return <div className={["environment-switcher", className].filter(Boolean).join(" ")}>
      <Select title={statusLabel} color={selectColor} className={readinessClass} value={settings.environment} options={environmentOptions} disabled={checkingEnvironment} onValueChange={value => void changeEnvironment(value as AppSettings["environment"])} />
    </div>
  }

  const quizzes = snapshot?.quizzes ?? []
  const built = quizzes.filter((q) => q.hasGeneratedArtifact).length
  const ready = quizzes.filter((q) => ["reviewed", "validated", "published"].includes(q.contentStatus)).length
  const contests = snapshot?.contests.length ?? 0

  return <div className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`.trim()}>
    <div className="routebar">
      <div className="route-address">
        <input className="route-value" value={routeDraft} aria-label="Application route" spellCheck={false} onFocus={event => event.currentTarget.select()} onChange={event => setRouteDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); goToRoute(routeDraft); event.currentTarget.blur() } else if (event.key === "Escape") { event.preventDefault(); setRouteDraft(currentRoute); event.currentTarget.blur() } }} />
        <div className="route-actions">
          <button type="button" onClick={refreshCurrentRoute} aria-label="Refresh route" title="Refresh route"><RefreshCw size={16} /></button>
          <button type="button" onClick={() => void copyCurrentRoute()} aria-label={routeCopied ? "Route copied" : "Copy route"} title={routeCopied ? "Copied" : "Copy route"}>{routeCopied ? <Check size={16} /> : <Copy size={16} />}</button>
        </div>
      </div>
    </div>
    <aside className="sidebar">
      <Button className="ui-page-header-folder sidebar-toggle" icon={sidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />} variant="icon" aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={() => setSidebarCollapsed(value => !value)} />
      <div className="brand"><div className="brand-mark"><GetGoIcon size={38} /></div><div className="brand-copy"><strong>GetGo</strong><span>TOOLS</span></div></div>
      <nav>{nav.map((item) => { const Icon = item.icon; return <button key={item.id} className={view === item.id ? "active" : ""} aria-label={item.label} title={sidebarCollapsed ? item.label : undefined} onClick={() => navigate(item.id)}><i><Icon size={18} strokeWidth={1.8} /></i><span>{item.label}</span></button> })}</nav>
      <div className="sidebar-footer"><span className="sidebar-workspace"><span className="status-dot" />Local workspace</span><strong>v0.1.0</strong></div>
    </aside>
    <main>
      <header className={`topbar ${settings.environment === "production" ? "production-header" : ""}`}>
        <div className="topbar-leading">{canNavigateBack && <Button className="ui-page-header-folder topbar-back" icon={<ArrowLeft />} variant="icon" aria-label="Go back" title="Go back" onClick={() => quizBackAction.current?.()} />}<button className="repository" onClick={choose}><span>Repository</span><strong>{settings.repositoryPath?.split(/[\\/]/).pop() ?? "Choose folder"}</strong></button></div>
        <div className="top-actions">
          {environmentSwitcher("compact")}
          {auth.state.user ? <AccountMenu user={auth.state.user} onSignOut={auth.signOut} /> : <Button disabled={auth.loading} onClick={auth.requestLogin}><LogIn size={15} />Sign in</Button>}
        </div>
      </header>
      <div className="content">
        <PageTransition key={routeRequest.key} trigger={[view, settings.repositoryPath]}>
        {error && <div className="error-banner" role="alert"><strong>Application error</strong><span>{error}</span><button className="error-banner-close" type="button" aria-label="Dismiss error" onClick={() => setError(null)}>×</button></div>}
        {view === "not-found" && <section className="empty-feature"><span className="eyebrow">Error 404</span><h2>Page not found</h2><p>No GetGo Tools page matches <code>{currentRoute}</code>.</p><Button variant="primary" onClick={() => navigate("dashboard")}>Go to dashboard</Button></section>}
        {!settings.repositoryPath && !loading && view !== "not-found" ? <section className="welcome"><div className="welcome-mark"><GetGoIcon size={56} /></div><h1>Connect your quiz repository</h1><p>Select the local <code>tnp-getgo-quizzes</code> folder to inspect quiz lifecycle and build status.</p><Button loading={choosingRepository} variant="primary" onClick={() => void choose()}>Choose repository</Button></section> : null}
        {settings.repositoryPath && view === "dashboard" && <>
          <PageHeader eyebrow="Workspace overview" title="Quiz operations" description="Local repository health and publishing readiness." actions={<Button variant="primary" onClick={() => navigate("quizzes")}>Browse quizzes</Button>} />
          <section className="metrics">
            <SummaryCard label="Total quizzes" value={quizzes.length} detail={`across ${contests} contests`} />
            <SummaryCard label="Ready to publish" value={ready} detail="reviewed or validated" />
            <SummaryCard label="Local builds" value={built} detail={`${quizzes.length - built} require a build`} />
            <SummaryCard className={snapshot?.issues.length ? "warn" : ""} label="Scan issues" value={snapshot?.issues.length ?? 0} detail={snapshot?.issues.length ? "manifests need attention" : "repository looks healthy"} />
          </section>
          <Panel title="Lifecycle distribution" description="Current manifest status across the repository" meta={<>Scanned {snapshot ? new Date(snapshot.scannedAt).toLocaleTimeString() : "—"}</>}>
            <div className="lifecycle">{["imported", "normalized", "generated", "reviewed", "validated", "published"].map((status) => { const count = quizzes.filter((q) => q.contentStatus === status).length; return <div key={status}><div><span>{status}</span><strong>{count}</strong></div><progress max={Math.max(quizzes.length, 1)} value={count} /></div> })}</div>
          </Panel>
        </>}
        {settings.repositoryPath && view === "quizzes" && snapshot && <Suspense fallback={<div className="manager-loading"><span />Loading quiz manager…</div>}><QuizManager snapshot={snapshot} initialRoute={routeRequest.route} onSnapshotChange={setSnapshot} onRouteChange={setCurrentRoute} onBackActionChange={updateQuizBackAction} /></Suspense>}
        {settings.repositoryPath && view === "publishing" && snapshot && <Suspense fallback={null}><PublishingPage environment={settings.environment} repository={snapshot} /></Suspense>}
        {settings.repositoryPath && view === "settings" && <section className="settings-page"><span className="eyebrow">Application</span><h1>Settings</h1><div className="panel settings-card"><label>Quiz repository<span>The folder containing quizzes/, generated/, and schemas/.</span></label><div><code>{settings.repositoryPath}</code><button className="secondary" onClick={choose}>Change</button></div><label>Active environment<span>Upload status will be reconciled independently for every environment.</span></label>{environmentSwitcher()}<label>AI generation profile<span>Thorough preserves the current full-reference behavior. Fast uses a compact reference and lower reasoning latency.</span></label><Select value={settings.aiProfile} options={aiProfileOptions} disabled={savingAiProfile} onValueChange={value => void changeAiProfile(value as AppSettings["aiProfile"])} /><label>Restart application<span>Development restarts keep the Vite hot-update connection active. Packaged builds relaunch GetGo Tools.</span></label><div><Button icon={<RotateCcw size={15} />} loading={restartingApp} variant="secondary" onClick={() => void restartApp()}>Restart GetGo Tools</Button></div></div></section>}
        </PageTransition>
      </div>
    </main>
    {routeCopied && <div className="copy-toast" role="status" aria-live="polite"><Check size={16} />Route copied</div>}
    {repositoryError && <DialogFrame presentation="modal" className="repository-error-dialog" hideFooter title="Could not open repository" busy={choosingRepository} error={null} onClose={() => setRepositoryError(null)} onSubmit={event => event.preventDefault()}><div className="repository-error-content"><i><AlertTriangle /></i><div><strong>The selected folder is not a valid quiz repository.</strong><span>{repositoryError}</span></div></div><div className="repository-error-actions"><Button disabled={choosingRepository} onClick={() => setRepositoryError(null)}>Close</Button><Button icon={<FolderOpen size={15} />} loading={choosingRepository} variant="solid" onClick={() => void choose()}>Choose another folder</Button></div></DialogFrame>}
    {loading && <div className="loading"><span />Scanning repository…</div>}
  </div>
}
