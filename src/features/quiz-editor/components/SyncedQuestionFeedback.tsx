import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { MessageSquareWarning, X } from "lucide-react";
import type { SyncedQuestionFeedback as Feedback, SyncedQuestionFeedbackStatus } from "../../../shared/domain/models";
import { Button } from "../../../shared/ui/Button";
import { StatusBadge } from "../../../shared/ui/StatusBadge";

const issueLabels: Record<string, string> = {
  missing_picture: "Missing picture",
  wrong_answer: "Wrong answer",
  misspelled_text: "Misspelled text",
  unclear_question: "Unclear question",
  broken_formatting: "Broken formatting",
  other: "Other",
};

type FeedbackGroup = {
  key: string;
  issues: string[];
  comment: string | null;
  records: Feedback[];
  pending: number;
  latestAt: string;
};

function groupFeedback(records: Feedback[]): FeedbackGroup[] {
  const groups = new Map<string, Feedback[]>();
  for (const record of records) {
    const issues = [...record.source.issueTypes].sort();
    const comment = record.source.comment?.trim() || "";
    const key = `${issues.join("|")}::${comment.toLocaleLowerCase()}`;
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }
  return Array.from(groups, ([key, items]) => ({
    key,
    issues: [...items[0]!.source.issueTypes].sort(),
    comment: items[0]!.source.comment?.trim() || null,
    records: items,
    pending: items.filter((item) => item.review.status === "pending").length,
    latestAt: items.reduce((latest, item) => item.source.reportedAt > latest ? item.source.reportedAt : latest, ""),
  })).sort((left, right) => right.pending - left.pending || right.records.length - left.records.length || right.latestAt.localeCompare(left.latestAt));
}

export function SyncedQuestionFeedback({ topicId, quizId, questionId, header, children }: {
  topicId: string;
  quizId: string;
  questionId: string;
  header(toggle: ReactNode): ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [records, setRecords] = useState<Feedback[] | null>(null);
  const [updatingGroup, setUpdatingGroup] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null);
    try { setRecords(await window.getgo.loadQuestionFeedback(topicId, quizId, questionId)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }, [questionId, quizId, topicId]);
  useEffect(() => { setRecords(null); void load(); }, [load]);
  const groups = useMemo(() => groupFeedback(records ?? []), [records]);
  const pending = records?.filter((record) => record.review.status === "pending").length ?? 0;

  const updateGroup = async (group: FeedbackGroup, status: SyncedQuestionFeedbackStatus) => {
    const targets = group.records.filter((record) => record.review.status !== status);
    if (!targets.length || updatingGroup) return;
    setUpdatingGroup(group.key);
    setError(null);
    try {
      const saved = await Promise.all(targets.map((record) =>
        window.getgo.updateQuestionFeedbackReview(topicId, quizId, record.id, status)));
      const savedById = new Map(saved.map((record) => [record.id, record]));
      setRecords((current) => current?.map((record) => savedById.get(record.id) ?? record) ?? current);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setUpdatingGroup(null); }
  };

  const toggle = <Button
        className={`synced-question-feedback-toggle ${open ? "is-active" : ""}`}
        variant="solid"
        color={pending ? "warning" : "neutral"}
        aria-pressed={open}
        icon={<MessageSquareWarning size={16} />}
        onClick={() => setOpen((value) => !value)}
      >
        Feedback <span className="synced-question-feedback-count">{pending}</span>
      </Button>;

  return <>
    {header(toggle)}
    <div className={`question-feedback-workspace ${open ? "has-feedback-panel" : ""}`}>
      <div className="question-feedback-editor">{children}</div>
      {open && <aside className="synced-question-feedback-panel" aria-label="Learner feedback">
        <header>
          <div><strong>Learner feedback</strong><span>{pending} pending · {records?.length ?? 0} total</span></div>
          <Button variant="icon" color="neutral" icon={<X />} aria-label="Close feedback" title="Close feedback" onClick={() => setOpen(false)} />
        </header>
        <div className="synced-question-feedback-panel-content">
          {records === null && !error && <div className="question-feedback-panel-loading">Loading feedback…</div>}
          {error && <div className="error-banner"><strong>Could not load feedback</strong><span>{error}</span><Button onClick={() => void load()}>Retry</Button></div>}
          {records !== null && !error && !groups.length && <div className="empty-feature"><h3>No synced feedback</h3><p>Use Sync feedback on the Feedback page to retrieve new reports.</p></div>}
          {groups.map((group) => <article className="synced-question-feedback-item" key={group.key}>
            <header>
              <div>{group.issues.map((issue) => <StatusBadge key={issue} tone="warning">{issueLabels[issue] ?? issue}</StatusBadge>)}</div>
              <StatusBadge tone={group.pending ? "warning" : "success"}>{group.records.length} report{group.records.length === 1 ? "" : "s"}</StatusBadge>
            </header>
            <p className={!group.comment ? "is-empty" : undefined}>{group.comment || "No comment"}</p>
            <small>{group.pending} pending · Latest {new Date(group.latestAt).toLocaleString()}</small>
            <footer>
              {group.pending > 0 ? <>
                <Button variant="solid" color="success" disabled={Boolean(updatingGroup)} loading={updatingGroup === group.key} onClick={() => void updateGroup(group, "fixed")}>Fixed</Button>
                <Button variant="solid" color="neutral" disabled={Boolean(updatingGroup)} onClick={() => void updateGroup(group, "ignored")}>Ignore</Button>
              </> : <Button variant="solid" color="neutral" disabled={Boolean(updatingGroup)} loading={updatingGroup === group.key} onClick={() => void updateGroup(group, "pending")}>Reopen</Button>}
            </footer>
          </article>)}
        </div>
      </aside>}
    </div>
  </>;
}
