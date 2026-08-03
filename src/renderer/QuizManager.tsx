import { useEffect, useMemo, useState } from "react"
import { ArrowLeft, Bot, Check, ChevronRight, ExternalLink, FolderOpen, Plus, RefreshCw, RotateCcw, Save, Search, Sparkles, Trash2, Zap } from "lucide-react"
import type { ContestSummary, QuizCrudInput, QuizMigrationResult, QuizQuestionRecord, QuizSummary, RepositorySnapshot } from "../core/models"
import { questionHasDynamicParams } from "../core/question-dynamics"
import { questionContainsImages } from "../core/question-images"
import { QuizCrudDialog } from "./CrudDialogs"
import { ContestSettingsDialog } from "./ContestSettingsDialog"
import { AdvancedQuestionEditor } from "./AdvancedQuestionEditor"
import { MigrationResultsDrawer } from "./MigrationResultsDrawer"
import { Breadcrumbs } from "./ui/Breadcrumbs"
import { Button } from "./ui/Button"
import { PageHeader } from "./ui/PageHeader"
import { SummaryStrip } from "./ui/SummaryCard"
import { Tabs } from "./ui/Tabs"
import { Toggle } from "./ui/Toggle"
import { DataTable, type DataColumn } from "./ui/DataTable"
import { useToast } from "./ui/Toast"

interface QuizManagerProps {
  snapshot: RepositorySnapshot
  initialRoute?: string
  onSnapshotChange(snapshot: RepositorySnapshot): void
  onRouteChange(route: string): void
}

type ManagerPage =
  | { kind: "contests" }
  | { kind: "contest"; contest: string }
  | { kind: "quiz"; quiz: QuizSummary }

interface QuestionListItem { number: string; category: string; prompt: string; dynamic: boolean; hasImages: boolean; reviewed: boolean; record: QuizQuestionRecord }

function questionPrompt(value: unknown): string {
  if (typeof value === "string") return value
  if (Array.isArray(value)) return value.filter(item => typeof item === "string").join(" ")
  return "Question content"
}

function restoredPage(snapshot: RepositorySnapshot, route?: string): { page: ManagerPage; questionNo: string | null } {
  if (!route?.startsWith("/quizzes/contests/")) return { page: { kind: "contests" }, questionNo: null }
  const parts = route.split("/").filter(Boolean).map(part => { try { return decodeURIComponent(part) } catch { return part } })
  const contest = snapshot.contests.find(item => item.id === parts[2])
  if (!contest) return { page: { kind: "contests" }, questionNo: null }
  if (parts[3] !== "quizzes" || !parts[4]) return { page: { kind: "contest", contest: contest.id }, questionNo: null }
  const quiz = snapshot.quizzes.find(item => item.contest === contest.id && item.id === parts[4])
  if (!quiz) return { page: { kind: "contest", contest: contest.id }, questionNo: null }
  return { page: { kind: "quiz", quiz }, questionNo: parts[5] === "questions" && parts[6] ? parts[6] : null }
}

export function QuizManager({ snapshot, initialRoute, onSnapshotChange, onRouteChange }: QuizManagerProps) {
  const toast = useToast()
  const [restored] = useState(() => restoredPage(snapshot, initialRoute))
  const [page, setPage] = useState<ManagerPage>(restored.page)
  const [query, setQuery] = useState("")
  const [sourceLoading, setSourceLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savingVerification, setSavingVerification] = useState(false)
  const [questionOperation, setQuestionOperation] = useState<"save" | "reset" | null>(null)
  const [buttonAction, setButtonAction] = useState<string | null>(null)
  const [sourceError, setSourceError] = useState<string | null>(null)
  const [aiOpen, setAiOpen] = useState(false)
  const [aiInstructions, setAiInstructions] = useState("")
  const [contestDialog, setContestDialog] = useState<ContestSummary | "create" | null>(null)
  const [quizDialog, setQuizDialog] = useState<QuizSummary | "create" | null>(null)
  const [contestTab, setContestTab] = useState<"info" | "quizzes">("quizzes")
  const [quizTab, setQuizTab] = useState<"info" | "questions">("questions")
  const [selectedQuestion, setSelectedQuestion] = useState<number | null>(null)
  const [questionRecords, setQuestionRecords] = useState<QuizQuestionRecord[]>([])
  const [questionDraftRecord, setQuestionDraftRecord] = useState<QuizQuestionRecord | null>(null)
  const [pendingQuestionNo, setPendingQuestionNo] = useState(restored.questionNo)
  const [migrationResults, setMigrationResults] = useState<{ result: QuizMigrationResult; attempted: number } | null>(null)

  const contests = useMemo(() => {
    return snapshot.contests.map(contest => ({ ...contest, quizzes: snapshot.quizzes.filter(quiz => quiz.contest === contest.id) }))
  }, [snapshot])

  const selectedContest = page.kind === "contest" ? contests.find((item) => item.id === page.contest) : null
  const normalizedQuery = query.trim().toLowerCase()
  const visibleContests = contests.filter(contest => !normalizedQuery || `${contest.id} ${contest.title} ${contest.description}`.toLowerCase().includes(normalizedQuery))
  const visibleQuizzes = (selectedContest?.quizzes ?? []).filter((quiz) => !normalizedQuery ||
    `${quiz.id} ${quiz.legacyId} ${quiz.grade ?? ""} ${quiz.round ?? ""} ${quiz.year ?? ""}`.toLowerCase().includes(normalizedQuery))
  const legacyQuizCount = selectedContest?.quizzes.filter(quiz => quiz.questionStorageVersion === "legacy").length ?? 0

  useEffect(() => {
    if (page.kind === "contests") { onRouteChange("/quizzes/contests"); if (pendingQuestionNo) setPendingQuestionNo(null) }
    if (page.kind === "contest") { onRouteChange(`/quizzes/contests/${encodeURIComponent(page.contest)}`); if (pendingQuestionNo) setPendingQuestionNo(null) }
    if (page.kind === "quiz") onRouteChange(`/quizzes/contests/${encodeURIComponent(page.quiz.contest)}/quizzes/${encodeURIComponent(page.quiz.id)}${pendingQuestionNo ? `/questions/${encodeURIComponent(pendingQuestionNo)}` : ""}`)
  }, [onRouteChange, page, pendingQuestionNo])

  useEffect(() => {
    if (page.kind !== "quiz") return
    let active = true
    setSourceLoading(true)
    setSourceError(null)
    window.getgo.loadQuizQuestions(page.quiz.manifestPath).then(records => {
      if (!active) return
      setQuestionRecords(records)
      if (pendingQuestionNo) {
        const index = records.findIndex(record => String(record.question_no) === pendingQuestionNo)
        if (index >= 0) { setSelectedQuestion(index); setQuestionDraftRecord(structuredClone(records[index])) }
        else setPendingQuestionNo(null)
      }
    }).catch(cause => {
      if (active) setSourceError(cause instanceof Error ? cause.message : String(cause))
    }).finally(() => { if (active) setSourceLoading(false) })
    return () => { active = false }
  }, [page])

  function goBack() {
    setQuery("")
    if (page.kind === "quiz") setPage({ kind: "contest", contest: page.quiz.contest })
    else setPage({ kind: "contests" })
  }

  async function runButtonAction(key: string, action: () => Promise<void>) {
    if (buttonAction) return
    setButtonAction(key)
    try { await action() }
    catch (cause) { const message = cause instanceof Error ? cause.message : String(cause); toast.show({ title: "Operation failed", description: message, variant: "error" }) }
    finally { setButtonAction(null) }
  }

  async function migrateLegacyQuizzes() {
    if (!selectedContest || !legacyQuizCount || !window.confirm(`Migrate ${legacyQuizCount} legacy quiz${legacyQuizCount === 1 ? "" : "zes"}? Questions will be extracted from raw.ts, falling back to raw.json. Existing source files will not be changed.`)) return
    await runButtonAction("migrate-legacy", async () => {
      const result = await window.getgo.migrateLegacyQuizzes(selectedContest.id)
      onSnapshotChange(result.snapshot)
      if (result.failures.length) {
        const details = result.failures.map(failure => `${failure.quizId}: ${failure.message}`).join("\n")
        console.error("[GetGo Tools][Quiz migration]", details)
        setMigrationResults({ result, attempted: legacyQuizCount })
        toast.show({ title: `Migrated ${result.migratedQuizIds.length} of ${legacyQuizCount} quizzes`, description: `${result.failures.length} quiz${result.failures.length === 1 ? "" : "zes"} failed. See migration results for details.`, variant: "error" })
        return
      }
      toast.show({ title: `${result.migratedQuizIds.length} quiz${result.migratedQuizIds.length === 1 ? "" : "zes"} migrated`, description: "Questions were extracted into the new questions folder structure." })
    })
  }

  if (page.kind === "quiz") {
    const { quiz } = page
    const quizContest = snapshot.contests.find(contest => contest.id === quiz.contest)
    const webAdminUrl = `https://tnp-getgo.web.app/getgo/admin/contests/${encodeURIComponent(quiz.contest)}/quizzes/${encodeURIComponent(quiz.id)}`
    const questions: QuestionListItem[] = questionRecords.map(record => ({
      number: String(record.question_no),
      category: typeof record.category === "string" ? record.category : "—",
      prompt: questionPrompt(record.text_en ?? record.text_vn),
      dynamic: questionHasDynamicParams(record.advancedDynamic),
      hasImages: questionContainsImages(record),
      reviewed: record.verified === true,
      record,
    }))
    const questionColumns: DataColumn<QuestionListItem>[] = [
      { key: "number", title: "Question", width: 100, render: item => <strong>#{item.number}</strong> },
      { key: "category", title: "Category", width: "24%", render: item => item.category },
      { key: "prompt", title: "Question text", render: item => <span className="question-text">{item.prompt}{item.dynamic && <Zap aria-label="Dynamic question" />}</span> },
      { key: "images", title: "Images", width: 90, render: item => item.hasImages ? <span className="question-image-indicator" title="Contains images"><Check aria-label="Contains images" /></span> : <span className="question-image-empty" aria-label="No images">—</span> },
      { key: "reviewed", title: "Reviewed", width: 110, render: item => <span className={`badge ${item.reviewed ? "badge-reviewed" : ""}`}>{item.reviewed ? "Reviewed" : "Pending"}</span> },
    ]
    const activeQuestion = selectedQuestion === null ? null : questions[selectedQuestion]
    if (activeQuestion) {
      const backToQuestions = () => { setSelectedQuestion(null); setPendingQuestionNo(null) }
      const saveQuestion = async () => {
        if (!questionDraftRecord?.advancedDynamic || saving || savingVerification) return
        setSaving(true); setQuestionOperation("save"); setSourceError(null)
        try {
          const savedQuestion = await window.getgo.saveQuizQuestion(quiz.manifestPath, questionDraftRecord)
          setQuestionDraftRecord(savedQuestion)
          setQuestionRecords(current => current.map(item => String(item.question_no) === String(savedQuestion.question_no) ? savedQuestion : item))
          toast.show({ title: `Question ${savedQuestion.question_no} saved`, description: "The formatted question file was updated." })
        }
        catch (cause) { const message = cause instanceof Error ? cause.message : String(cause); setSourceError(message); toast.show({ title: "Could not save question", description: message, variant: "error" }) }
        finally { setSaving(false); setQuestionOperation(null) }
      }
      const resetQuestion = async () => {
        if (!questionDraftRecord || saving || savingVerification || !window.confirm("Reset this question to its default generated TypeScript? This will remove all AI-generated code and AI response history.")) return
        setSaving(true); setQuestionOperation("reset"); setSourceError(null)
        try {
          const reset = await window.getgo.resetQuizQuestion(quiz.manifestPath, questionDraftRecord)
          setQuestionDraftRecord(reset)
          setQuestionRecords(current => current.map(item => String(item.question_no) === String(reset.question_no) ? reset : item))
          toast.show({ title: `Question ${reset.question_no} reset`, description: "Default TypeScript was restored and AI data was removed." })
        } catch (cause) { const message = cause instanceof Error ? cause.message : String(cause); setSourceError(message); toast.show({ title: "Could not reset question", description: message, variant: "error" }) }
        finally { setSaving(false); setQuestionOperation(null) }
      }
      const setQuestionVerified = async (verified: boolean) => {
        if (!questionDraftRecord || saving || savingVerification) return
        const previousVerified = questionDraftRecord.verified === true
        setQuestionDraftRecord(current => current ? { ...current, verified } : current)
        setSavingVerification(true)
        try {
          const savedQuestion = await window.getgo.saveQuizQuestion(quiz.manifestPath, { ...activeQuestion.record, verified })
          setQuestionRecords(current => current.map(item => String(item.question_no) === String(savedQuestion.question_no) ? savedQuestion : item))
          setQuestionDraftRecord(current => current ? { ...current, verified: savedQuestion.verified === true } : current)
          toast.show({ title: verified ? "Question verified" : "Question marked unverified", description: `Question ${savedQuestion.question_no} review status was updated.` })
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : String(cause)
          setQuestionDraftRecord(current => current ? { ...current, verified: previousVerified } : current)
          toast.show({ title: "Could not update verification", description: message, variant: "error" })
        } finally { setSavingVerification(false) }
      }
      return <section className="manager editor-page question-detail-page">
        <Breadcrumbs items={[{ label: "Contests", onClick: () => setPage({ kind: "contests" }) }, { label: quiz.contest.toUpperCase(), onClick: goBack }, { label: quiz.title, onClick: backToQuestions }, { label: `Question ${activeQuestion.number}` }]} />
        <PageHeader variant="editor" eyebrow="Advanced question editor" title={`Question ${activeQuestion.number}`} description={`${activeQuestion.category} · questions/q${activeQuestion.number}.json`} leading={<button className="back-button" onClick={backToQuestions} aria-label="Back to questions"><ArrowLeft /></button>} actions={<><Toggle variant="button" checkedLabel="Verified" uncheckedLabel="Pending" ariaLabel="Mark question as verified" checked={questionDraftRecord?.verified === true} disabled={saving || savingVerification} onCheckedChange={verified => void setQuestionVerified(verified)} /><Button icon={<RotateCcw size={15} />} loading={questionOperation === "reset"} disabled={saving || savingVerification || !questionDraftRecord?.advancedDynamic} onClick={() => void resetQuestion()}>Reset</Button><Button icon={<Save size={15} />} loading={questionOperation === "save"} variant="solid" disabled={saving || savingVerification || !questionDraftRecord?.advancedDynamic} onClick={() => void saveQuestion()}>Save</Button></>} />
        {sourceError && <div className="error-banner"><strong>Editor error</strong><span>{sourceError}</span></div>}
        {questionDraftRecord?.advancedDynamic && <AdvancedQuestionEditor record={questionDraftRecord} path={`${quiz.relativePath}/questions/q${activeQuestion.number}`} context={{ contestId: quiz.contest, quizId: quiz.id, title: quiz.title, year: quiz.year, grade: quiz.grade, round: quiz.round }} onChange={setQuestionDraftRecord} onSave={() => void saveQuestion()} />}
      </section>
    }
    return <section className="manager editor-page">
      <Breadcrumbs items={[{ label: "Contests", onClick: () => setPage({ kind: "contests" }) }, { label: quiz.contest.toUpperCase(), onClick: goBack }, { label: quiz.id }]} />
      <PageHeader variant="editor" eyebrow="Quiz detail" title={quiz.title} description={`${quiz.id} · ${[quiz.grade && `Grade ${quiz.grade}`, quiz.round, quiz.year].filter(Boolean).join(" · ")}`} leading={<button className="back-button" onClick={goBack} aria-label="Back to contest"><ArrowLeft /></button>} actions={quizTab === "info" ? <Button icon={<Trash2 size={15} />} loading={buttonAction === "delete-quiz"} variant="solid" color="danger" disabled={Boolean(buttonAction)} onClick={() => { if (!window.confirm(`Delete ${quiz.title}? This will move the quiz folder to Trash.`)) return; void runButtonAction("delete-quiz", async () => { const next = await window.getgo.deleteQuiz(quiz.manifestPath); onSnapshotChange(next); setPage({ kind: "contest", contest: quiz.contest }); toast.show({ title: "Quiz deleted", description: `${quiz.title} was moved to Trash.` }) }) }}>Delete quiz</Button> : <><Button icon={<FolderOpen size={15} />} loading={buttonAction === "show-files"} disabled={Boolean(buttonAction)} onClick={() => void runButtonAction("show-files", () => window.getgo.showInFolder(quiz.manifestPath))}>Files</Button><Button icon={<Sparkles size={15} />} className="ai-button" onClick={() => setAiOpen(value => !value)}>AI assist</Button></>} />
      <SummaryStrip items={[{ label: "Status", value: quiz.contentStatus }, { label: "QuizBuilder API", value: quiz.quizBuilderApiVersion ?? "—" }, { label: "Questions", value: quiz.questionCount ?? "—" }, { label: "Artifact", value: quiz.hasGeneratedArtifact ? "Built" : "Not built" }]} />
      <Tabs<"info" | "questions"> variant="underline" className="contest-detail-tabs" ariaLabel="Quiz detail" value={quizTab} onChange={setQuizTab} items={[{ id: "questions", label: "Questions", badge: questions.length || quiz.questionCount || 0 }, { id: "info", label: "Info" }]} />
      {quizTab === "info" && quizContest && <QuizCrudDialog embedded quiz={quiz} contest={quizContest} onClose={() => undefined} onSaved={async input => { const next = await window.getgo.updateQuiz(quiz.manifestPath, { title: input.title, grade: input.grade, round: input.round, year: input.year, status: input.status, quizBuilderApiVersion: input.quizBuilderApiVersion }); onSnapshotChange(next); const updated = next.quizzes.find(item => item.key === quiz.key); if (updated) setPage({ kind: "quiz", quiz: updated }); toast.show({ title: "Quiz updated", description: `${input.title} was saved.` }) }} />}
      {quizTab === "questions" && <>{sourceError && <div className="error-banner"><strong>Editor error</strong><span>{sourceError}</span></div>}
      {aiOpen && <div className="ai-panel">
        <div className="ai-panel-icon"><Bot /></div><div className="ai-panel-copy"><strong>GetGo AI assistant</strong><span>AI generation uses the authenticated web-admin service. Continue there to generate or revise question code with the same quiz context.</span></div>
        <textarea value={aiInstructions} onChange={event => setAiInstructions(event.target.value)} placeholder="Describe the question or change you want…" aria-label="AI instructions" />
        <Button icon={<ExternalLink size={15} />} loading={buttonAction === "open-ai-editor"} variant="solid" disabled={Boolean(buttonAction)} onClick={() => void runButtonAction("open-ai-editor", () => window.getgo.openExternal(webAdminUrl))}>Open authenticated AI editor</Button>
      </div>}
      <DataTable ariaLabel="Quiz questions" rows={questions} columns={questionColumns} rowKey={(item, index) => `${item.number}-${index}`} emptyText={sourceLoading ? "Loading questions…" : "No questions found in questions/ or raw.json."} onRowClick={(item, index) => { setSelectedQuestion(index); setQuestionDraftRecord(structuredClone(item.record)); setPendingQuestionNo(item.number) }} /></>}
    </section>
  }

  const isContest = page.kind === "contest"
  return <section className="manager">
    {isContest && <Breadcrumbs items={[{ label: "Contests", onClick: () => setPage({ kind: "contests" }) }, { label: page.contest.toUpperCase() }]} />}
    <PageHeader className="manager-heading" eyebrow="Quiz manager" title={isContest ? selectedContest?.title ?? page.contest.toUpperCase() : "Contests"} description={isContest ? `${selectedContest?.quizzes.length ?? 0} quizzes in this contest` : `${contests.length} contests across the local repository`} leading={isContest ? <button className="back-button" onClick={goBack}><ArrowLeft /></button> : undefined} actions={<>{isContest && contestTab === "quizzes" && legacyQuizCount > 0 && <Button icon={<RefreshCw size={15} />} loading={buttonAction === "migrate-legacy"} variant="solid" color="warning" disabled={Boolean(buttonAction)} onClick={() => void migrateLegacyQuizzes()}>Migrate {legacyQuizCount}</Button>}{(!isContest || contestTab === "quizzes") && <Button icon={<Plus size={15} />} variant="solid" disabled={Boolean(buttonAction)} onClick={() => isContest ? setQuizDialog("create") : setContestDialog("create")}>{isContest ? "Create quiz" : "Create contest"}</Button>}{isContest && contestTab === "info" && selectedContest && <Button icon={<Trash2 size={15} />} loading={buttonAction === "delete-contest"} variant="solid" color="danger" disabled={Boolean(buttonAction)} onClick={() => { if (!window.confirm(`Delete ${selectedContest.title}? This will move the contest folder to Trash.`)) return; void runButtonAction("delete-contest", async () => { const next = await window.getgo.deleteContest(selectedContest.id); onSnapshotChange(next); setPage({ kind: "contests" }); toast.show({ title: "Contest deleted", description: `${selectedContest.title} was moved to Trash.` }) }) }}>Delete contest</Button>}</>} />
    {isContest && <Tabs<"info" | "quizzes"> variant="underline" className="contest-detail-tabs" ariaLabel="Contest detail" value={contestTab} onChange={setContestTab} items={[{ id: "quizzes", label: "Quizzes", badge: selectedContest?.quizzes.length ?? 0 }, { id: "info", label: "Info" }]} />}
    {isContest && contestTab === "info" && selectedContest && <ContestSettingsDialog embedded contest={selectedContest} onClose={() => undefined} onSaved={async settings => { const next = await window.getgo.updateContest(selectedContest.id, settings); onSnapshotChange(next); toast.show({ title: "Contest updated", description: `${settings.book.title} was saved.` }) }} />}
    {(!isContest || contestTab === "quizzes") && <><div className="manager-search"><Search size={17} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder={isContest ? "Search quizzes…" : "Search contests…"} /></div>
    <div className="manager-table"><table><thead><tr>{isContest ? <><th>Quiz</th><th>Version</th><th>Grade</th><th>Year / round</th><th>Questions</th><th>Status</th><th /></> : <><th>Contest</th><th>Quizzes</th><th>Ready</th><th>Builds</th><th /></>}</tr></thead><tbody>
      {isContest ? visibleQuizzes.map(quiz => <tr key={quiz.key} onClick={() => { setPage({ kind: "quiz", quiz }); setQuizTab("questions") }}><td><strong>{quiz.title}</strong><span>{quiz.id}</span></td><td><span className={`badge quiz-version quiz-version-${quiz.questionStorageVersion}`}>{quiz.questionStorageVersion === "questions-v1" ? "Questions v1" : "Legacy"}</span></td><td>{quiz.grade ?? "—"}</td><td><strong>{quiz.year ?? "—"}</strong><span>{quiz.round ?? "No round"}</span></td><td>{quiz.questionCount ?? "—"}</td><td><span className={`badge badge-${quiz.contentStatus}`}>{quiz.contentStatus}</span></td><td><ChevronRight size={16} /></td></tr>) : visibleContests.map(contest => { const ready = contest.quizzes.filter(quiz => ["reviewed", "validated", "published"].includes(quiz.contentStatus)).length; const builds = contest.quizzes.filter(quiz => quiz.hasGeneratedArtifact).length; return <tr key={contest.id} onClick={() => { setPage({ kind: "contest", contest: contest.id }); setContestTab("quizzes"); setQuery("") }}><td><strong>{contest.title}</strong><span>{contest.description || contest.id.toUpperCase()}</span></td><td>{contest.quizzes.length}</td><td>{ready}</td><td>{builds}</td><td><ChevronRight size={16} /></td></tr> })}
    </tbody></table>{(isContest ? visibleQuizzes : visibleContests).length === 0 && <div className="no-results">No matching {isContest ? "quizzes" : "contests"}.</div>}</div></>}
    {contestDialog && <ContestSettingsDialog contest={contestDialog === "create" ? undefined : contestDialog} onClose={() => setContestDialog(null)} onSaved={async settings => { const creating = contestDialog === "create"; const next = creating ? await window.getgo.createContest(settings) : await window.getgo.updateContest(contestDialog.id, settings); onSnapshotChange(next); setContestDialog(null); toast.show({ title: creating ? "Contest created" : "Contest updated", description: `${settings.book.title} was saved.` }) }} onDeleted={contestDialog !== "create" ? async () => { const title = contestDialog.title; const next = await window.getgo.deleteContest(contestDialog.id); onSnapshotChange(next); setContestDialog(null); setPage({ kind: "contests" }); toast.show({ title: "Contest deleted", description: `${title} was moved to Trash.` }) } : undefined} />}
    {quizDialog === "create" && isContest && selectedContest && <QuizCrudDialog contest={selectedContest} onClose={() => setQuizDialog(null)} onSaved={async (input: QuizCrudInput) => { const next = await window.getgo.createQuiz(page.contest, { ...input, status: "imported" }); onSnapshotChange(next); setQuizDialog(null); toast.show({ title: "Quiz created", description: `${input.title} is ready to edit.` }) }} />}
    {migrationResults && <MigrationResultsDrawer result={migrationResults.result} attempted={migrationResults.attempted} onClose={() => setMigrationResults(null)} />}
  </section>
}
