import { useEffect, useMemo, useRef, useState } from "react";
import type { AppSettings, BackgroundJob, BackgroundJobLog, DeploymentItemState, DeploymentJobReportStep } from "../../../shared/domain/models";
import * as ui from "../../../shared/ui";
import en from "../../../shared/localization/en.json";
import vi from "../../../shared/localization/vi.json";
import { jobStatusLabel } from "../../jobs/components/JobStatusBadge";

function duration(value?: number) {
  if (value === undefined) return "—";
  if (value < 1000) return `${value} ms`;
  const seconds = value / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 2 : 1)} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${(seconds % 60).toFixed(1)}s`;
}

function stepDuration(step: DeploymentJobReportStep, now: number) {
  if (step.durationMs !== undefined) return step.durationMs;
  if (step.status !== "running" || !step.startedAt) return undefined;
  return Math.max(0, now - Date.parse(step.startedAt));
}

export function DeploymentJobReportDrawer({ locale, job, onClose }: { locale: AppSettings["locale"]; job: BackgroundJob; onClose(): void }) {
  const copy = (locale === "vi" ? vi : en).jobs.report;
  const report = job.report;
  const [now, setNow] = useState(Date.now());
  const [expanded, setExpanded] = useState({ summary: true, tasks: true, output: false, artifacts: false });
  const setSectionExpanded = (section: keyof typeof expanded, value: boolean) => setExpanded(current => ({ ...current, [section]: value }));
  const isActive = ["queued", "running", "paused"].includes(job.status);
  const outputRef = useRef<HTMLDivElement>(null);
  const logs = useMemo<BackgroundJobLog[]>(() => job.logs?.length ? job.logs : report?.steps.flatMap(step =>
    step.details.map(message => ({ timestamp: step.finishedAt ?? step.startedAt ?? report.startedAt ?? job.createdAt, stream: step.status === "failed" ? "stderr" : "stdout", message })),
  ) ?? [], [job.createdAt, job.logs, report]);
  useEffect(() => {
    const output = outputRef.current;
    if (output) output.scrollTop = output.scrollHeight;
  }, [logs.length]);
  useEffect(() => {
    if (!isActive) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isActive]);
  const startedAt = job.startedAt ?? report?.startedAt;
  const finishedAt = job.finishedAt ?? report?.finishedAt;
  const elapsedMs = startedAt
    ? Math.max(0, (finishedAt ? Date.parse(finishedAt) : now) - Date.parse(startedAt))
    : undefined;
  const version = job.version
    ? `${job.version}${job.buildNumber ? ` (${job.buildNumber})` : ""}`
    : report?.version;
  const errorDebugText = [
    job.name,
    `Status: ${job.status}`,
    `Operation: ${job.operation ?? report?.operation ?? "—"}`,
    `Component: ${job.component ?? report?.component ?? "—"}`,
    `Environment: ${job.target ?? report?.target ?? "—"}`,
    `Started: ${job.startedAt ?? report?.startedAt ?? "—"}`,
    `Finished: ${job.finishedAt ?? report?.finishedAt ?? "—"}`,
    `Version: ${version ?? "—"}`,
    `Error: ${job.error ?? "—"}`,
    "",
    "Job output:",
    ...logs.map(log => `[${log.stream}] ${log.message}`),
  ].join("\n");
  const stepColumns: ui.DataColumn<DeploymentJobReportStep>[] = [
    { key: "label", title: copy.step, render: step => <strong className="deployment-report-task-name">{step.label}</strong> },
    { key: "status", title: copy.status, width: 110, render: step => <span className={`badge job-status job-status-${step.status}`}>{copy.statuses[step.status]}</span> },
    { key: "progress", title: copy.taskProgress, width: 150, render: step => {
      const hasMeasuredProgress = typeof step.completed === "number" && typeof step.total === "number" && step.total > 0;
      const percent = hasMeasuredProgress ? Math.min(100, Math.round((step.completed! / step.total!) * 100)) : step.status === "completed" ? 100 : 0;
      const indeterminate = step.status === "running" && !hasMeasuredProgress;
      const progressText = hasMeasuredProgress ? `${step.completed}/${step.total} · ${percent}%` : `${percent}%`;
      return <div className="deployment-report-task-progress"><progress max={100} {...(indeterminate ? {} : { value: percent })} /><small>{indeterminate ? copy.inProgress : step.status === "skipped" ? "—" : progressText}</small></div>;
    } },
    { key: "duration", title: copy.duration, width: 100, align: "right", render: step => <span className="job-table-time">{duration(stepDuration(step, now))}</span> },
  ];
  const artifactColumns: ui.DataColumn<DeploymentItemState>[] = [
    { key: "id", title: copy.artifact, width: 180, render: item => <strong>{item.id}</strong> },
    { key: "local", title: copy.localHash, render: item => <code className="deployment-report-hash">{item.localHash ?? "—"}</code> },
    { key: "deployed", title: copy.deployedHash, render: item => <code className="deployment-report-hash">{item.deployedHash ?? "—"}</code> },
  ];

  return <ui.DialogFrame presentation="drawer" className="deployment-report-drawer" hideFooter title={copy.title.replace("{name}", job.name)} busy={false} error={null} onClose={onClose} onSubmit={event => event.preventDefault()}>
    {job.error && <ui.ErrorFrame message={job.error} copyValue={errorDebugText} />}
    <div className="deployment-report-panels deployment-report-sections-inline">
      <ui.AccordionSection variant="inline" title={copy.summary} expanded={expanded.summary} onExpandedChange={value => setSectionExpanded("summary", value)}>
        <div className="deployment-report-summary">
          <div><small>{copy.operation}</small><strong>{job.operation ?? report?.operation ?? job.kind}</strong></div>
          <div><small>{copy.component}</small><strong>{job.component ?? report?.component ?? "—"}</strong></div>
          <div><small>{copy.environment}</small><strong>{job.target ?? report?.target ?? "—"}</strong></div>
          <div><small>{copy.result}</small><strong>{jobStatusLabel(job.status, locale)}</strong></div>
          <div><small>{copy.version}</small><code>{version ?? "—"}</code></div>
          <div><small>{copy.totalTime}</small><strong>{duration(report?.durationMs ?? elapsedMs)}</strong></div>
          <div><small>{copy.started}</small><span>{job.startedAt ? new Date(job.startedAt).toLocaleString(locale) : "—"}</span></div>
          <div><small>{copy.finished}</small><span>{job.finishedAt ? new Date(job.finishedAt).toLocaleString(locale) : "—"}</span></div>
        </div>
      </ui.AccordionSection>
      {report && <ui.AccordionSection variant="inline" className="deployment-report-tasks" title={copy.steps} expanded={expanded.tasks} onExpandedChange={value => setSectionExpanded("tasks", value)}>
        <ui.DataTable ariaLabel={copy.steps} rows={report.steps} columns={stepColumns} rowKey={(step, index) => `${step.id}-${index}`} emptyText={copy.noSteps} />
      </ui.AccordionSection>}
      <ui.AccordionSection variant="inline" title={copy.liveOutput} expanded={expanded.output} onExpandedChange={value => setSectionExpanded("output", value)}>
        <div ref={outputRef} className="job-live-output" role="log" aria-live="polite" aria-label={copy.liveOutput}>
          {logs.length ? logs.map((log, index) => <div className={`job-log-line job-log-${log.stream}`} key={`${log.timestamp}-${index}`}><time>{new Date(log.timestamp).toLocaleTimeString(locale)}</time><span>{log.message}</span></div>) : <p>{copy.noOutput}</p>}
        </div>
      </ui.AccordionSection>
      {report && <ui.AccordionSection variant="inline" title={copy.artifacts} expanded={expanded.artifacts} onExpandedChange={value => setSectionExpanded("artifacts", value)}>
        <ui.DataTable ariaLabel={copy.artifacts} rows={report.items} columns={artifactColumns} rowKey={item => item.id} emptyText={copy.noArtifacts} />
      </ui.AccordionSection>}
    </div>
  </ui.DialogFrame>;
}
