import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Download } from "lucide-react";
import type { QuestionFeedbackOverview } from "../../../shared/domain/models";
import { useAuth } from "../../authentication/components/AuthContext";
import {
  Button,
  DataTable,
  ErrorFrame,
  PageHeader,
  SearchField,
  Select,
  StatusBadge,
  SummaryCard,
  TableActionButton,
  useToast,
  type DataColumn,
} from "../../../shared/ui";

type FeedbackQuestion = QuestionFeedbackOverview & {
  pending: number;
  latestAt: string;
  issues: string[];
};

function withCounts(items: QuestionFeedbackOverview[]): FeedbackQuestion[] {
  return items.map((item) => ({
    ...item,
    pending: item.reports.filter((report) => report.review.status === "pending").length,
    latestAt: item.reports.reduce(
      (latest, item) => item.source.reportedAt > latest ? item.source.reportedAt : latest,
      "",
    ),
    issues: Array.from(new Set(item.reports.flatMap((report) => report.source.issueTypes))),
  }));
}

export function QuestionFeedbackPage({
  onOpenQuestion,
}: {
  onOpenQuestion(topicId: string, quizId: string, questionId: string): void;
}) {
  const toast = useToast();
  const auth = useAuth();
  const [overviews, setOverviews] = useState<QuestionFeedbackOverview[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");

  const load = useCallback(async () => {
    try {
      setOverviews(await window.getgo.listQuestionFeedbackOverview());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const sync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const result = await window.getgo.syncQuestionFeedback();
      await load();
      toast.show({
        title: "Question feedback synchronized",
        description: result.saved
          ? `${result.saved} new report${result.saved === 1 ? "" : "s"} saved to the matching quiz folders.`
          : "No new question feedback was found.",
        variant: "success",
      });
    } catch (cause) {
      toast.show({
        title: "Feedback sync failed",
        description: cause instanceof Error ? cause.message : String(cause),
        variant: "error",
      });
    } finally {
      setSyncing(false);
    }
  };
  const requestSync = () => auth.requireAuth(sync);

  const allRows = useMemo(() => withCounts(overviews ?? []), [overviews]);
  const rows = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return allRows.filter((row) => {
      if (status === "pending" && row.pending === 0) return false;
      if (status === "resolved" && row.pending > 0) return false;
      if (!normalized) return true;
      return [row.topicTitle, row.topicId, row.quizTitle, row.quizId, row.questionId, row.questionText, ...row.issues]
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalized);
    });
  }, [allRows, query, status]);
  const reportCount = overviews?.reduce((total, item) => total + item.reports.length, 0) ?? 0;
  const pendingReports = overviews?.reduce((total, item) => total + item.reports.filter((report) => report.review.status === "pending").length, 0) ?? 0;

  const columns = useMemo<DataColumn<FeedbackQuestion>[]>(() => [
    {
      key: "question",
      title: "Question",
      width: "38%",
      sortValue: (row) => row.key,
      render: (row) => <div className="feedback-question-identity"><strong>{row.topicTitle} <span aria-hidden="true">›</span> {row.quizTitle}</strong><span>Question {row.questionId.replace(/^q/i, "")} · {row.questionText}</span></div>,
    },
    {
      key: "reports",
      title: "Reports",
      width: 100,
      align: "center",
      sortValue: (row) => row.reports.length,
      render: (row) => <strong>{row.reports.length}</strong>,
    },
    {
      key: "pending",
      title: "Pending",
      width: 110,
      align: "center",
      sortValue: (row) => row.pending,
      render: (row) => <StatusBadge tone={row.pending ? "warning" : "success"}>{row.pending}</StatusBadge>,
    },
    {
      key: "issues",
      title: "Reported issues",
      width: "32%",
      render: (row) => row.issues.join(", ") || "—",
    },
    {
      key: "latest",
      title: "Latest",
      width: 170,
      sortValue: (row) => row.latestAt,
      render: (row) => new Date(row.latestAt).toLocaleString(),
    },
    {
      key: "open",
      title: "",
      width: 52,
      role: "actions",
      render: (row) => <TableActionButton icon={<ArrowRight />} aria-label="Open question" title="Open question" onClick={() => onOpenQuestion(row.topicId, row.quizId, row.questionId)} />,
    },
  ], [onOpenQuestion]);

  return <section className="question-feedback-page">
    <PageHeader
      eyebrow="Content quality"
      title="Question feedback"
      description="Review learner reports, prioritize repeated issues, and open the affected question directly."
      actions={<Button variant="primary" icon={<Download />} loading={syncing || auth.loading} onClick={requestSync}>Sync feedback</Button>}
    />
    <section className="metrics question-feedback-metrics">
      <SummaryCard label="Reports" value={reportCount} detail="synchronized locally" />
      <SummaryCard label="Questions" value={allRows.length} detail="with learner feedback" />
      <SummaryCard label="Pending" value={pendingReports} detail="awaiting admin review" />
    </section>
    <div className="question-feedback-filters">
      <SearchField value={query} placeholder="Search topic, quiz, question, or issue" ariaLabel="Search question feedback" clearLabel="Clear feedback search" onValueChange={setQuery} />
      <Select
        value={status}
        ariaLabel="Filter feedback status"
        options={[
          { value: "all", label: "All feedback" },
          { value: "pending", label: "Pending review" },
          { value: "resolved", label: "Resolved" },
        ]}
        onValueChange={setStatus}
      />
    </div>
    {error && <div className="question-feedback-error"><ErrorFrame message={error} /><Button onClick={() => void load()}>Retry</Button></div>}
    {!error && overviews === null && <div className="question-feedback-loading">Loading question feedback…</div>}
    {!error && overviews !== null && <DataTable
      rows={rows}
      columns={columns}
      rowKey={(row) => row.key}
      ariaLabel="Question feedback"
      emptyText={query || status !== "all" ? "No feedback matches these filters." : "No synchronized question feedback."}
      defaultSort={{ key: "reports", direction: "desc" }}
      horizontalScroll
      onRowClick={(row) => onOpenQuestion(row.topicId, row.quizId, row.questionId)}
    />}
  </section>;
}
