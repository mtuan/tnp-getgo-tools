import { lazy, Suspense, useEffect, useState } from "react"
import { Check, CloudUpload, Copy, LayoutDashboard, Library, RefreshCw, Settings, Sparkles, Workflow, type LucideIcon } from "lucide-react"
import type { AppSettings, ContentStatus, DeploymentStatus, RepositorySnapshot } from "../core/models"
import { GetGoIcon } from "./GetGoIcon"
import { PageTransition } from "./PageTransition"
import { Button } from "./ui/Button"
import { PageHeader } from "./ui/PageHeader"
import { Panel } from "./ui/Panel"
import { SummaryCard } from "./ui/SummaryCard"

const QuizManager = lazy(() => import("./QuizManager").then(module => ({ default: module.QuizManager })))

type View = "dashboard" | "quizzes" | "jobs" | "publishing" | "settings"
const lastRouteKey = "getgo-tools:last-route"
const readLastRoute = () => { try { return localStorage.getItem(lastRouteKey) || "/dashboard" } catch { return "/dashboard" } }
const viewFromRoute = (route: string): View => route.startsWith("/quizzes") ? "quizzes" : (["dashboard", "jobs", "publishing", "settings"].includes(route.slice(1)) ? route.slice(1) as View : "dashboard")
const nav: { id: View; label: string; icon: LucideIcon }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "quizzes", label: "Quizzes", icon: Library },
  { id: "jobs", label: "Jobs", icon: Workflow },
  { id: "publishing", label: "Publishing", icon: CloudUpload },
  { id: "settings", label: "Settings", icon: Settings },
]

function Badge({ value }: { value: ContentStatus | DeploymentStatus }) {
  return <span className={`badge badge-${value}`}>{value.replace("-", " ")}</span>
}

function EmptyFeature({ title, detail }: { title: string; detail: string }) {
  return <section className="empty-feature"><div className="empty-icon"><Sparkles /></div><h2>{title}</h2><p>{detail}</p><span>Planned for the next implementation phase</span></section>
}

export function App() {
  const [initialRoute] = useState(readLastRoute)
  const [view, setView] = useState<View>(() => viewFromRoute(initialRoute))
  const [settings, setSettings] = useState<AppSettings>({ repositoryPath: null, environment: "staging" })
  const [snapshot, setSnapshot] = useState<RepositorySnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentRoute, setCurrentRoute] = useState(initialRoute)
  const [routeCopied, setRouteCopied] = useState(false)

  async function scan(path?: string) {
    setLoading(true); setError(null)
    try { setSnapshot(await window.getgo.scanRepository(path)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setLoading(false) }
  }
  async function choose() {
    setError(null)
    try {
      const result = await window.getgo.chooseRepository()
      if (result) { setSnapshot(result); setSettings((s) => ({ ...s, repositoryPath: result.repositoryPath })) }
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
  }
  useEffect(() => {
    window.getgo.getSettings().then((value) => {
      setSettings(value)
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
      <header className="topbar">
        <button className="repository" onClick={choose}><span>Repository</span><strong>{settings.repositoryPath?.split(/[\\/]/).pop() ?? "Choose folder"}</strong></button>
        <div className="top-actions">
          <select className={settings.environment === "production" ? "production" : ""} value={settings.environment} onChange={async (event) => setSettings(await window.getgo.setEnvironment(event.target.value as AppSettings["environment"]))}>
            <option value="development">Development</option><option value="staging">Staging</option><option value="production">Production</option>
          </select>
          <button className="icon-button" disabled={!settings.repositoryPath || loading} onClick={() => scan()} title="Rescan" aria-label="Rescan repository"><RefreshCw size={17} /></button>
        </div>
      </header>
      <div className="content">
        <PageTransition trigger={[view, settings.repositoryPath]}>
        {error && <div className="error-banner"><strong>Could not scan repository</strong><span>{error}</span><button onClick={() => setError(null)}>×</button></div>}
        {!settings.repositoryPath && !loading ? <section className="welcome"><div className="welcome-mark"><GetGoIcon size={56} /></div><h1>Connect your quiz repository</h1><p>Select the local <code>tnp-getgo-quizzes</code> folder to inspect quiz lifecycle and build status.</p><Button variant="primary" onClick={choose}>Choose repository</Button></section> : null}
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
        {settings.repositoryPath && view === "quizzes" && snapshot && <Suspense fallback={<div className="manager-loading"><span />Loading quiz manager…</div>}><QuizManager snapshot={snapshot} initialRoute={initialRoute} onChangeRepository={choose} onSnapshotChange={setSnapshot} onRouteChange={setCurrentRoute} /></Suspense>}
        {settings.repositoryPath && view === "jobs" && <EmptyFeature title="Pipeline jobs" detail="Validation, builds, and publish operations will appear here with structured progress and logs." />}
        {settings.repositoryPath && view === "publishing" && <EmptyFeature title="Publishing workspace" detail="Remote reconciliation and safe staging/production publishing will be added after pipeline extraction." />}
        {settings.repositoryPath && view === "settings" && <section className="settings-page"><span className="eyebrow">Application</span><h1>Settings</h1><div className="panel settings-card"><label>Quiz repository<span>The folder containing quizzes/, generated/, and schemas/.</span></label><div><code>{settings.repositoryPath}</code><button className="secondary" onClick={choose}>Change</button></div><label>Active environment<span>Upload status will be reconciled independently for every environment.</span></label><select value={settings.environment} onChange={async (event) => setSettings(await window.getgo.setEnvironment(event.target.value as AppSettings["environment"]))}><option value="development">Development</option><option value="staging">Staging</option><option value="production">Production</option></select></div></section>}
        </PageTransition>
      </div>
    </main>
    {routeCopied && <div className="copy-toast" role="status" aria-live="polite"><Check size={16} />Route copied</div>}
    {loading && <div className="loading"><span />Scanning repository…</div>}
  </div>
}
