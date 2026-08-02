import { useEffect, useMemo, useState } from "react"
import { CloudUpload, FolderOpen, LayoutDashboard, Library, RefreshCw, Settings, Sparkles, Workflow, X, type LucideIcon } from "lucide-react"
import type { AppSettings, ContentStatus, DeploymentStatus, QuizSummary, RepositorySnapshot } from "../core/models"
import { PageTransition } from "./PageTransition"

type View = "dashboard" | "quizzes" | "jobs" | "publishing" | "settings"
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
  const [view, setView] = useState<View>("dashboard")
  const [settings, setSettings] = useState<AppSettings>({ repositoryPath: null, environment: "staging" })
  const [snapshot, setSnapshot] = useState<RepositorySnapshot | null>(null)
  const [selected, setSelected] = useState<QuizSummary | null>(null)
  const [query, setQuery] = useState("")
  const [contentFilter, setContentFilter] = useState("all")
  const [deploymentFilter, setDeploymentFilter] = useState("all")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  const filtered = useMemo(() => (snapshot?.quizzes ?? []).filter((quiz) => {
    const haystack = `${quiz.id} ${quiz.legacyId} ${quiz.contest} ${quiz.grade ?? ""} ${quiz.year ?? ""}`.toLowerCase()
    return haystack.includes(query.toLowerCase()) &&
      (contentFilter === "all" || quiz.contentStatus === contentFilter) &&
      (deploymentFilter === "all" || quiz.deploymentStatus === deploymentFilter)
  }), [snapshot, query, contentFilter, deploymentFilter])
  const quizzes = snapshot?.quizzes ?? []
  const built = quizzes.filter((q) => q.hasGeneratedArtifact).length
  const ready = quizzes.filter((q) => ["reviewed", "validated", "published"].includes(q.contentStatus)).length
  const contests = new Set(quizzes.map((q) => q.contest)).size

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">G</div><div><strong>GetGo</strong><span>TOOLS</span></div></div>
      <nav>{nav.map((item) => { const Icon = item.icon; return <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><i><Icon size={18} strokeWidth={1.8} /></i>{item.label}</button> })}</nav>
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
        {!settings.repositoryPath && !loading ? <section className="welcome"><div className="welcome-mark">G</div><h1>Connect your quiz repository</h1><p>Select the local <code>tnp-getgo-quizzes</code> folder to inspect quiz lifecycle and build status.</p><button className="primary" onClick={choose}>Choose repository</button></section> : null}
        {settings.repositoryPath && view === "dashboard" && <>
          <div className="page-heading"><div><span className="eyebrow">Workspace overview</span><h1>Quiz operations</h1><p>Local repository health and publishing readiness.</p></div><button className="primary" onClick={() => setView("quizzes")}>Browse quizzes</button></div>
          <section className="metrics">
            <article><span>Total quizzes</span><strong>{quizzes.length}</strong><small>across {contests} contests</small></article>
            <article><span>Ready to publish</span><strong>{ready}</strong><small>reviewed or validated</small></article>
            <article><span>Local builds</span><strong>{built}</strong><small>{quizzes.length - built} require a build</small></article>
            <article className={snapshot?.issues.length ? "warn" : ""}><span>Scan issues</span><strong>{snapshot?.issues.length ?? 0}</strong><small>{snapshot?.issues.length ? "manifests need attention" : "repository looks healthy"}</small></article>
          </section>
          <section className="panel"><div className="panel-heading"><div><h2>Lifecycle distribution</h2><p>Current manifest status across the repository</p></div><span>Scanned {snapshot ? new Date(snapshot.scannedAt).toLocaleTimeString() : "—"}</span></div>
            <div className="lifecycle">{["imported", "normalized", "generated", "reviewed", "validated", "published"].map((status) => { const count = quizzes.filter((q) => q.contentStatus === status).length; return <div key={status}><div><span>{status}</span><strong>{count}</strong></div><progress max={Math.max(quizzes.length, 1)} value={count} /></div> })}</div>
          </section>
        </>}
        {settings.repositoryPath && view === "quizzes" && <>
          <div className="page-heading"><div><span className="eyebrow">Content library</span><h1>Quizzes</h1><p>{filtered.length} of {quizzes.length} quizzes</p></div><button className="secondary" onClick={choose}>Change repository</button></div>
          <div className="filters"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search ID, contest, grade, or year…" /><select value={contentFilter} onChange={(e) => setContentFilter(e.target.value)}><option value="all">All content states</option>{["imported", "normalized", "generated", "reviewed", "validated", "published"].map((s) => <option key={s}>{s}</option>)}</select><select value={deploymentFilter} onChange={(e) => setDeploymentFilter(e.target.value)}><option value="all">All deployment states</option>{["not-built", "not-uploaded", "uploaded", "outdated", "unknown"].map((s) => <option key={s}>{s}</option>)}</select></div>
          <section className="table-panel"><table><thead><tr><th>Quiz</th><th>Contest</th><th>Content</th><th>Local deployment</th><th>Source</th><th>Modified</th></tr></thead><tbody>{filtered.map((quiz) => <tr key={quiz.key} onClick={() => setSelected(quiz)}><td><strong>{quiz.id}</strong><span>{quiz.legacyId}</span></td><td><strong>{quiz.contest.toUpperCase()}</strong><span>{[quiz.grade, quiz.year].filter(Boolean).join(" · ") || "—"}</span></td><td><Badge value={quiz.contentStatus} /></td><td><Badge value={quiz.deploymentStatus} /></td><td><div className="file-dots"><i className={quiz.hasSourcePdf ? "yes" : ""}>P</i><i className={quiz.hasRawJson ? "yes" : ""}>J</i><i className={quiz.hasQuizTs ? "yes" : ""}>T</i></div></td><td>{new Date(quiz.modifiedAt).toLocaleDateString()}</td></tr>)}</tbody></table>{!filtered.length && <div className="no-results">No quizzes match these filters.</div>}</section>
        </>}
        {settings.repositoryPath && view === "jobs" && <EmptyFeature title="Pipeline jobs" detail="Validation, builds, and publish operations will appear here with structured progress and logs." />}
        {settings.repositoryPath && view === "publishing" && <EmptyFeature title="Publishing workspace" detail="Remote reconciliation and safe staging/production publishing will be added after pipeline extraction." />}
        {settings.repositoryPath && view === "settings" && <section className="settings-page"><span className="eyebrow">Application</span><h1>Settings</h1><div className="panel settings-card"><label>Quiz repository<span>The folder containing quizzes/, generated/, and schemas/.</span></label><div><code>{settings.repositoryPath}</code><button className="secondary" onClick={choose}>Change</button></div><label>Active environment<span>Upload status will be reconciled independently for every environment.</span></label><select value={settings.environment} onChange={async (event) => setSettings(await window.getgo.setEnvironment(event.target.value as AppSettings["environment"]))}><option value="development">Development</option><option value="staging">Staging</option><option value="production">Production</option></select></div></section>}
        </PageTransition>
      </div>
    </main>
    {loading && <div className="loading"><span />Scanning repository…</div>}
    {selected && <div className="drawer-backdrop" onClick={() => setSelected(null)}><aside className="drawer" onClick={(e) => e.stopPropagation()}><button className="drawer-close" onClick={() => setSelected(null)} aria-label="Close quiz details"><X size={21} /></button><span className="eyebrow">{selected.contest}</span><h2>{selected.id}</h2><p className="muted">{selected.relativePath}</p><div className="drawer-badges"><Badge value={selected.contentStatus} /><Badge value={selected.deploymentStatus} /></div><dl><div><dt>Legacy ID</dt><dd>{selected.legacyId}</dd></div><div><dt>Grade / round</dt><dd>{[selected.grade, selected.round].filter(Boolean).join(" / ") || "—"}</dd></div><div><dt>Year</dt><dd>{selected.year || "—"}</dd></div><div><dt>QuizBuilder API</dt><dd>{selected.quizBuilderApiVersion ?? "—"}</dd></div><div><dt>Generated artifact</dt><dd>{selected.hasGeneratedArtifact ? "Available" : "Not built"}</dd></div><div><dt>Artifact hash</dt><dd className="hash">{selected.artifactHash?.slice(0, 16) ?? "—"}</dd></div></dl><h3>Canonical inputs</h3><div className="input-list"><span className={selected.hasSourcePdf ? "present" : ""}>source.pdf</span><span className={selected.hasRawJson ? "present" : ""}>raw.json</span><span className={selected.hasQuizTs ? "present" : ""}>quiz.ts</span></div><button className="secondary full folder-button" onClick={() => window.getgo.showInFolder(selected.manifestPath)}><FolderOpen size={15} />Show in folder</button></aside></div>}
  </div>
}
