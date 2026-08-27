import { useEffect, useMemo, useRef } from "react";
import type { AppSettings, BackgroundJob, BackgroundJobLog, DeploymentItemState, DeploymentJobReportStep } from "../../../shared/domain/models";
import * as ui from "../../../shared/ui";
import en from "../../../shared/localization/en.json";
import vi from "../../../shared/localization/vi.json";

function duration(value?: number) {
  if (value === undefined) return "—";
  if (value < 1000) return `${value} ms`;
  const seconds = value / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 2 : 1)} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${(seconds % 60).toFixed(1)}s`;
}

export function DeploymentJobReportDrawer({ locale, job, onClose }: { locale: AppSettings["locale"]; job: BackgroundJob; onClose(): void }) {
  const copy = (locale === "vi" ? vi : en).jobs.report;
  const report = job.report;
  const outputRef = useRef<HTMLDivElement>(null);
  const logs = useMemo<BackgroundJobLog[]>(() => job.logs?.length ? job.logs : report?.steps.flatMap(step =>
    step.details.map(message => ({ timestamp: step.finishedAt ?? step.startedAt, stream: step.status === "failed" ? "stderr" : "stdout", message })),
  ) ?? [], [job.logs, report?.steps]);
  useEffect(() => {
    const output = outputRef.current;
    if (output) output.scrollTop = output.scrollHeight;
  }, [logs.length]);
  const errorDebugText = [
    job.name,
    `Status: ${job.status}`,
    `Operation: ${job.operation ?? report?.operation ?? "—"}`,
    `Component: ${job.component ?? report?.component ?? "—"}`,
    `Environment: ${job.target ?? report?.target ?? "—"}`,
    `Started: ${job.startedAt ?? report?.startedAt ?? "—"}`,
    `Finished: ${job.finishedAt ?? report?.finishedAt ?? "—"}`,
    `Error: ${job.error ?? "—"}`,
    "",
    "Job output:",
    ...logs.map(log => `[${log.stream}] ${log.message}`),
  ].join("\n");
  const stepColumns: ui.DataColumn<DeploymentJobReportStep>[] = [
    { key: "label", title: copy.step, render: step => <div className="deployment-report-step"><strong>{step.label}</strong>{step.details.map((detail, index) => <small key={`${detail}-${index}`}>{detail}</small>)}</div> },
    { key: "status", title: copy.status, width: 110, render: step => <span className={`badge job-status job-status-${step.status}`}>{step.status}</span> },
    { key: "duration", title: copy.duration, width: 100, align: "right", render: step => <span className="job-table-time">{duration(step.durationMs)}</span> },
  ];
  const artifactColumns: ui.DataColumn<DeploymentItemState>[] = [
    { key: "id", title: copy.artifact, width: 180, render: item => <strong>{item.id}</strong> },
    { key: "local", title: copy.localHash, render: item => <code className="deployment-report-hash">{item.localHash ?? "—"}</code> },
    { key: "deployed", title: copy.deployedHash, render: item => <code className="deployment-report-hash">{item.deployedHash ?? "—"}</code> },
  ];

  return <ui.DialogFrame presentation="drawer" className="deployment-report-drawer" hideFooter title={copy.title.replace("{name}", job.name)} busy={false} error={null} onClose={onClose} onSubmit={event => event.preventDefault()}>
    {job.error && <ui.ErrorFrame message={job.error} copyValue={errorDebugText} />}
    <div className="deployment-report-summary">
      <div><small>{copy.operation}</small><strong>{job.operation ?? report?.operation ?? job.kind}</strong></div>
      <div><small>{copy.component}</small><strong>{job.component ?? report?.component ?? "—"}</strong></div>
      <div><small>{copy.environment}</small><strong>{job.target ?? report?.target ?? "—"}</strong></div>
      <div><small>{copy.result}</small><strong>{job.status}</strong></div>
      <div><small>{copy.version}</small><code>{report?.version ?? "—"}</code></div>
      <div><small>{copy.totalTime}</small><strong>{duration(report?.durationMs)}</strong></div>
      <div><small>{copy.started}</small><span>{job.startedAt ? new Date(job.startedAt).toLocaleString(locale) : "—"}</span></div>
      <div><small>{copy.finished}</small><span>{job.finishedAt ? new Date(job.finishedAt).toLocaleString(locale) : "—"}</span></div>
    </div>
    <section className="deployment-report-section">
      <h3>{copy.liveOutput}</h3>
      <div ref={outputRef} className="job-live-output" role="log" aria-live="polite" aria-label={copy.liveOutput}>
        {logs.length ? logs.map((log, index) => <div className={`job-log-line job-log-${log.stream}`} key={`${log.timestamp}-${index}`}><time>{new Date(log.timestamp).toLocaleTimeString(locale)}</time><span>{log.message}</span></div>) : <p>{copy.noOutput}</p>}
      </div>
    </section>
    {report && <>
    <section className="deployment-report-section">
      <h3>{copy.steps}</h3>
      <ui.DataTable ariaLabel={copy.steps} rows={report.steps} columns={stepColumns} rowKey={(step, index) => `${step.id}-${index}`} emptyText={copy.noSteps} />
    </section>
    <section className="deployment-report-section">
      <h3>{copy.artifacts}</h3>
      <ui.DataTable ariaLabel={copy.artifacts} rows={report.items} columns={artifactColumns} rowKey={item => item.id} emptyText={copy.noArtifacts} />
    </section>
    </>}
  </ui.DialogFrame>;
}
