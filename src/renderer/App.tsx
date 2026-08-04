import { lazy, Suspense, useEffect, useRef, useState } from "react"
import { Bot, Check, CloudUpload, Copy, LayoutDashboard, Library, LogIn, Settings, Sparkles, Workflow, type LucideIcon } from "lucide-react"
import type { AppSettings, ContentStatus, DeploymentStatus, EnvironmentReadiness, RepositorySnapshot } from "../core/models"
import { useAuth } from "./AuthContext"
import { AccountMenu } from "./AccountMenu"
import { AiUsagePage } from "./AiUsagePage"
import { GetGoIcon } from "./GetGoIcon"
import { PageTransition } from "./PageTransition"
import { Button } from "./ui/Button"
import { PageHeader } from "./ui/PageHeader"
import { Panel } from "./ui/Panel"
import { SummaryCard } from "./ui/SummaryCard"
import { Select, type SelectOption } from "./ui/Select"
import { useToast } from "./ui/Toast"

const QuizManager = lazy(() => import("./QuizManager").then(module => ({ default: module.QuizManager })))

type View = "dashboard" | "quizzes" | "jobs" | "publishing" | "ai-usage" | "settings"
const lastRouteKey = "getgo-tools:last-route"
const readLastRoute = () => { try { return localStorage.getItem(lastRouteKey) || "/dashboard" } catch { return "/dashboard" } }
const viewFromRoute = (route: string): View => route.startsWith("/quizzes") ? "quizzes" : (["dashboard", "jobs", "publishing", "ai-usage", "settings"].includes(route.slice(1)) ? route.slice(1) as View : "dashboard")
const nav: { id: View; label: string; icon: LucideIcon }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "quizzes", label: "Quizzes", icon: Library },
  { id: "jobs", label: "Jobs", icon: Workflow },
  { id: "publishing", label: "Publishing", icon: CloudUpload },
  { id: "ai-usage", label: "AI usage", icon: Bot },
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

function EmptyFeature({ title, detail }: { title: string; detail: string }) {
  return <section className="empty-feature"><div className="empty-icon"><Sparkles /></div><h2>{title}</h2><p>{detail}</p><span>Planned for the next implementation phase</span></section>
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
  const [currentRoute, setCurrentRoute] = useState(initialRoute)
  const [routeCopied, setRouteCopied] = useState(false)
  const [environmentReadiness, setEnvironmentReadiness] = useState<EnvironmentReadiness | null>(null)
  const [checkingEnvironment, setCheckingEnvironment] = useState(false)
  const [savingAiProfile, setSavingAiProfile] = useState(false)
  const environmentCheckId = useRef(0)

  async function scan(path?: string, announce = false) {
    setLoading(true); setError(null)
    try { setSnapshot(await window.getgo.scanRepository(path)); if (announce) toast.show({ title: "Repository refreshed", description: "Local contests and quizzes are up to date." }) }
    catch (cause) { const message = cause instanceof Error ? cause.message : String(cause); setError(message); if (announce) toast.show({ title: "Refresh failed", description: message, variant: "error" }) }
    finally { setLoading(false) }
  }
  async function choose() {
    setError(null); setChoosingRepository(true)
    try {
      const result = await window.getgo.chooseRepository()
      if (result) { setSnapshot(result); setSettings((s) => ({ ...s, repositoryPath: result.repositoryPath })); toast.show({ title: "Repository connected", description: result.repositoryPath }) }
    } catch (cause) { const message = cause instanceof Error ? cause.message : String(cause); setError(message); toast.show({ title: "Could not connect repository", description: message, variant: "error" }) }
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
  function navigate(view: View) { setView(view); setCurrentRoute(view === "quizzes" ? "/quizzes/contests" : `/${view}`) }

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

  return <div className="app-shell">
    <div className="routebar">
      <div className="route-address" onClick={() => void copyCurrentRoute()} title="Copy route">
        <span className="route-value">{currentRoute}</span>
        <button type="button" onClick={(event) => { event.stopPropagation(); void copyCurrentRoute() }} aria-label={routeCopied ? "Route copied" : "Copy route"} title={routeCopied ? "Copied" : "Copy route"}>
          {routeCopied ? <Check size={16} /> : <Copy size={16} />}
        </button>
      </div>
    </div>
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><GetGoIcon size={38} /></div><div><strong>GetGo</strong><span>TOOLS</span></div></div>
      <nav>{nav.map((item) => { const Icon = item.icon; return <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => navigate(item.id)}><i><Icon size={18} strokeWidth={1.8} /></i>{item.label}</button> })}</nav>
      <div className="sidebar-footer"><span className="status-dot" />Local workspace<strong>v0.1.0</strong></div>
    </aside>
    <main>
      <header className={`topbar ${settings.environment === "production" ? "production-header" : ""}`}>
        <button className="repository" onClick={choose}><span>Repository</span><strong>{settings.repositoryPath?.split(/[\\/]/).pop() ?? "Choose folder"}</strong></button>
        <div className="top-actions">
          {environmentSwitcher("compact")}
          {auth.state.user ? <AccountMenu user={auth.state.user} onSignOut={auth.signOut} /> : <Button disabled={auth.loading} onClick={auth.requestLogin}><LogIn size={15} />Sign in</Button>}
        </div>
      </header>
      <div className="content">
        <PageTransition trigger={[view, settings.repositoryPath]}>
        {error && <div className="error-banner"><strong>Could not scan repository</strong><span>{error}</span><button onClick={() => setError(null)}>×</button></div>}
        {!settings.repositoryPath && !loading ? <section className="welcome"><div className="welcome-mark"><GetGoIcon size={56} /></div><h1>Connect your quiz repository</h1><p>Select the local <code>tnp-getgo-quizzes</code> folder to inspect quiz lifecycle and build status.</p><Button loading={choosingRepository} variant="primary" onClick={() => void choose()}>Choose repository</Button></section> : null}
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
        {settings.repositoryPath && view === "quizzes" && snapshot && <Suspense fallback={<div className="manager-loading"><span />Loading quiz manager…</div>}><QuizManager snapshot={snapshot} initialRoute={initialRoute} onSnapshotChange={setSnapshot} onRouteChange={setCurrentRoute} /></Suspense>}
        {settings.repositoryPath && view === "jobs" && <EmptyFeature title="Pipeline jobs" detail="Validation, builds, and publish operations will appear here with structured progress and logs." />}
        {settings.repositoryPath && view === "publishing" && <EmptyFeature title="Publishing workspace" detail="Remote reconciliation and safe staging/production publishing will be added after pipeline extraction." />}
        {settings.repositoryPath && view === "ai-usage" && <AiUsagePage />}
        {settings.repositoryPath && view === "settings" && <section className="settings-page"><span className="eyebrow">Application</span><h1>Settings</h1><div className="panel settings-card"><label>Quiz repository<span>The folder containing quizzes/, generated/, and schemas/.</span></label><div><code>{settings.repositoryPath}</code><button className="secondary" onClick={choose}>Change</button></div><label>Active environment<span>Upload status will be reconciled independently for every environment.</span></label>{environmentSwitcher()}<label>AI generation profile<span>Thorough preserves the current full-reference behavior. Fast uses a compact reference and lower reasoning latency.</span></label><Select value={settings.aiProfile} options={aiProfileOptions} disabled={savingAiProfile} onValueChange={value => void changeAiProfile(value as AppSettings["aiProfile"])} /></div></section>}
        </PageTransition>
      </div>
    </main>
    {routeCopied && <div className="copy-toast" role="status" aria-live="polite"><Check size={16} />Route copied</div>}
    {loading && <div className="loading"><span />Scanning repository…</div>}
  </div>
}
