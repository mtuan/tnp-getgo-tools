import { useEffect, useMemo, useState } from "react"
import { ArrowLeft, Bot, Check, ChevronRight, Code2, ExternalLink, FileCode2, FolderOpen, Save, Search, Sparkles } from "lucide-react"
import type { QuizSummary, RepositorySnapshot } from "../core/models"
import { QuizCodeEditor } from "./QuizCodeEditor"

interface QuizManagerProps {
  snapshot: RepositorySnapshot
  onChangeRepository(): void
}

type ManagerPage =
  | { kind: "contests" }
  | { kind: "contest"; contest: string }
  | { kind: "quiz"; quiz: QuizSummary }

export function QuizManager({ snapshot, onChangeRepository }: QuizManagerProps) {
  const [page, setPage] = useState<ManagerPage>({ kind: "contests" })
  const [query, setQuery] = useState("")
  const [source, setSource] = useState("")
  const [savedSource, setSavedSource] = useState("")
  const [sourceLoading, setSourceLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [sourceError, setSourceError] = useState<string | null>(null)
  const [aiOpen, setAiOpen] = useState(false)
  const [aiInstructions, setAiInstructions] = useState("")

  const contests = useMemo(() => {
    const grouped = new Map<string, QuizSummary[]>()
    for (const quiz of snapshot.quizzes) grouped.set(quiz.contest, [...(grouped.get(quiz.contest) ?? []), quiz])
    return [...grouped].map(([id, quizzes]) => ({ id, quizzes })).sort((a, b) => a.id.localeCompare(b.id))
  }, [snapshot])

  const selectedContest = page.kind === "contest" ? contests.find((item) => item.id === page.contest) : null
  const normalizedQuery = query.trim().toLowerCase()
  const visibleContests = contests.filter(({ id }) => !normalizedQuery || id.toLowerCase().includes(normalizedQuery))
  const visibleQuizzes = (selectedContest?.quizzes ?? []).filter((quiz) => !normalizedQuery ||
    `${quiz.id} ${quiz.legacyId} ${quiz.grade ?? ""} ${quiz.round ?? ""} ${quiz.year ?? ""}`.toLowerCase().includes(normalizedQuery))

  useEffect(() => {
    if (page.kind !== "quiz") return
    let active = true
    setSourceLoading(true)
    setSourceError(null)
    window.getgo.readQuizSource(page.quiz.manifestPath).then(value => {
      if (!active) return
      setSource(value)
      setSavedSource(value)
    }).catch(cause => {
      if (active) setSourceError(cause instanceof Error ? cause.message : String(cause))
    }).finally(() => { if (active) setSourceLoading(false) })
    return () => { active = false }
  }, [page])

  useEffect(() => {
    if (page.kind !== "quiz" || source === savedSource) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "s") return
      event.preventDefault()
      void saveSource()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  })

  async function saveSource() {
    if (page.kind !== "quiz" || saving || source === savedSource) return
    setSaving(true)
    setSourceError(null)
    try {
      await window.getgo.saveQuizSource(page.quiz.manifestPath, source)
      setSavedSource(source)
    } catch (cause) {
      setSourceError(cause instanceof Error ? cause.message : String(cause))
    } finally { setSaving(false) }
  }

  function goBack() {
    setQuery("")
    if (page.kind === "quiz") setPage({ kind: "contest", contest: page.quiz.contest })
    else setPage({ kind: "contests" })
  }

  if (page.kind === "quiz") {
    const { quiz } = page
    const dirty = source !== savedSource
    const webAdminUrl = `https://tnp-getgo.web.app/getgo/admin/contests/${encodeURIComponent(quiz.contest)}/quizzes/${encodeURIComponent(quiz.id)}`
    return <section className="manager editor-page">
      <div className="manager-breadcrumbs"><button onClick={() => setPage({ kind: "contests" })}>Contests</button><ChevronRight /><button onClick={goBack}>{quiz.contest.toUpperCase()}</button><ChevronRight /><span>{quiz.id}</span></div>
      <div className="editor-heading">
        <div><button className="back-button" onClick={goBack} aria-label="Back to contest"><ArrowLeft /></button><div><span className="eyebrow">Quiz detail</span><h1>{quiz.id}</h1><p>{[quiz.grade && `Grade ${quiz.grade}`, quiz.round, quiz.year].filter(Boolean).join(" · ")}</p></div></div>
        <div className="editor-actions">
          <button className="secondary" onClick={() => window.getgo.showInFolder(quiz.manifestPath)}><FolderOpen size={15} />Files</button>
          <button className="secondary ai-button" onClick={() => setAiOpen(value => !value)}><Sparkles size={15} />AI assist</button>
          <button className="primary" disabled={!dirty || saving || sourceLoading} onClick={() => void saveSource()}>{saving ? <span className="mini-spinner" /> : dirty ? <Save size={15} /> : <Check size={15} />}{saving ? "Saving…" : dirty ? "Save" : "Saved"}</button>
        </div>
      </div>
      <div className="quiz-facts">
        <span><strong>Status</strong>{quiz.contentStatus}</span><span><strong>QuizBuilder API</strong>{quiz.quizBuilderApiVersion ?? "—"}</span><span><strong>Questions</strong>{quiz.questionCount ?? "—"}</span><span><strong>Artifact</strong>{quiz.hasGeneratedArtifact ? "Built" : "Not built"}</span>
      </div>
      {sourceError && <div className="error-banner"><strong>Editor error</strong><span>{sourceError}</span></div>}
      {aiOpen && <div className="ai-panel">
        <div className="ai-panel-icon"><Bot /></div><div className="ai-panel-copy"><strong>GetGo AI assistant</strong><span>AI generation uses the authenticated web-admin service. Continue there to generate or revise question code with the same quiz context.</span></div>
        <textarea value={aiInstructions} onChange={event => setAiInstructions(event.target.value)} placeholder="Describe the question or change you want…" aria-label="AI instructions" />
        <button className="primary" onClick={() => void window.getgo.openExternal(webAdminUrl)}><ExternalLink size={15} />Open authenticated AI editor</button>
      </div>}
      <div className="code-workspace">
        <div className="code-tabbar"><span className="active"><FileCode2 size={14} />quiz.ts{dirty && <i />}</span><div><Code2 size={14} />TypeScript · QuizBuilder IntelliSense</div></div>
        <div className="code-editor">{sourceLoading ? <div className="editor-loading"><span />Loading quiz source…</div> : sourceError && !source ? <div className="editor-empty">quiz.ts could not be opened.</div> : <QuizCodeEditor value={source} path={`${quiz.relativePath}/quiz.ts`} onChange={setSource} onSave={() => void saveSource()} />}</div>
        <div className="editor-statusbar"><span>TypeScript</span><span>UTF-8</span><span>{source.split("\n").length} lines</span><span>{dirty ? "Modified" : "Saved"}</span></div>
      </div>
    </section>
  }

  const isContest = page.kind === "contest"
  return <section className="manager">
    {isContest && <div className="manager-breadcrumbs"><button onClick={() => setPage({ kind: "contests" })}>Contests</button><ChevronRight /><span>{page.contest.toUpperCase()}</span></div>}
    <div className="page-heading manager-heading"><div>{isContest && <button className="back-button" onClick={goBack}><ArrowLeft /></button>}<div><span className="eyebrow">Quiz manager</span><h1>{isContest ? page.contest.toUpperCase() : "Contests"}</h1><p>{isContest ? `${selectedContest?.quizzes.length ?? 0} quizzes in this contest` : `${contests.length} contests across the local repository`}</p></div></div><button className="secondary" onClick={onChangeRepository}>Change repository</button></div>
    <div className="manager-search"><Search size={17} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder={isContest ? "Search quizzes…" : "Search contests…"} /></div>
    <div className="manager-table"><table><thead><tr>{isContest ? <><th>Quiz</th><th>Grade</th><th>Year / round</th><th>Questions</th><th>Status</th><th /></> : <><th>Contest</th><th>Quizzes</th><th>Ready</th><th>Builds</th><th /></>}</tr></thead><tbody>
      {isContest ? visibleQuizzes.map(quiz => <tr key={quiz.key} onClick={() => setPage({ kind: "quiz", quiz })}><td><strong>{quiz.id}</strong><span>{quiz.legacyId}</span></td><td>{quiz.grade ?? "—"}</td><td><strong>{quiz.year ?? "—"}</strong><span>{quiz.round ?? "No round"}</span></td><td>{quiz.questionCount ?? "—"}</td><td><span className={`badge badge-${quiz.contentStatus}`}>{quiz.contentStatus}</span></td><td><ChevronRight size={16} /></td></tr>) : visibleContests.map(contest => { const ready = contest.quizzes.filter(quiz => ["reviewed", "validated", "published"].includes(quiz.contentStatus)).length; const builds = contest.quizzes.filter(quiz => quiz.hasGeneratedArtifact).length; return <tr key={contest.id} onClick={() => { setPage({ kind: "contest", contest: contest.id }); setQuery("") }}><td><strong>{contest.id.toUpperCase()}</strong><span>Local contest repository</span></td><td>{contest.quizzes.length}</td><td>{ready}</td><td>{builds}</td><td><ChevronRight size={16} /></td></tr> })}
    </tbody></table>{(isContest ? visibleQuizzes : visibleContests).length === 0 && <div className="no-results">No matching {isContest ? "quizzes" : "contests"}.</div>}</div>
  </section>
}
