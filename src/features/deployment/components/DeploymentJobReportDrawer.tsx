import type { AppSettings, BackgroundJob, DeploymentItemState, DeploymentJobReportStep } from "../../../shared/domain/models";
import { DataTable, DialogFrame, ErrorFrame, type DataColumn } from "../../../shared/ui";
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
  const report = job.report!;
  const errorDebugText = [
    job.name,
    `Status: ${job.status}`,
    `Operation: ${report.operation}`,
    `Component: ${report.component}`,
    `Environment: ${report.target}`,
    `Started: ${report.startedAt}`,
    `Finished: ${report.finishedAt ?? "—"}`,
    `Error: ${job.error ?? "—"}`,
    "",
    "Deployment output:",
    ...report.steps.flatMap((step) => [
      `[${step.status}] ${step.label}`,
      ...step.details,
    ]),
  ].join("\n");
  const stepColumns: DataColumn<DeploymentJobReportStep>[] = [
    { key: "label", title: copy.step, render: step => <div className="deployment-report-step"><strong>{step.label}</strong>{step.details.map((detail, index) => <small key={`${detail}-${index}`}>{detail}</small>)}</div> },
    { key: "status", title: copy.status, width: 110, render: step => <span className={`badge job-status job-status-${step.status}`}>{step.status}</span> },
    { key: "duration", title: copy.duration, width: 100, align: "right", render: step => <span className="job-table-time">{duration(step.durationMs)}</span> },
  ];
  const artifactColumns: DataColumn<DeploymentItemState>[] = [
    { key: "id", title: copy.artifact, width: 180, render: item => <strong>{item.id}</strong> },
    { key: "local", title: copy.localHash, render: item => <code className="deployment-report-hash">{item.localHash ?? "—"}</code> },
    { key: "deployed", title: copy.deployedHash, render: item => <code className="deployment-report-hash">{item.deployedHash ?? "—"}</code> },
  ];

  return <DialogFrame presentation="drawer" className="deployment-report-drawer" hideFooter title={copy.title.replace("{name}", job.name)} busy={false} error={null} onClose={onClose} onSubmit={event => event.preventDefault()}>
    {job.error && <ErrorFrame message={job.error} copyValue={errorDebugText} />}
    <div className="deployment-report-summary">
      <div><small>{copy.operation}</small><strong>{report.operation}</strong></div>
      <div><small>{copy.component}</small><strong>{report.component}</strong></div>
      <div><small>{copy.environment}</small><strong>{report.target}</strong></div>
      <div><small>{copy.result}</small><strong>{job.status}</strong></div>
      <div><small>{copy.version}</small><code>{report.version ?? "—"}</code></div>
      <div><small>{copy.totalTime}</small><strong>{duration(report.durationMs)}</strong></div>
      <div><small>{copy.started}</small><span>{new Date(report.startedAt).toLocaleString(locale)}</span></div>
      <div><small>{copy.finished}</small><span>{report.finishedAt ? new Date(report.finishedAt).toLocaleString(locale) : "—"}</span></div>
    </div>
    <section className="deployment-report-section">
      <h3>{copy.steps}</h3>
      <DataTable ariaLabel={copy.steps} rows={report.steps} columns={stepColumns} rowKey={(step, index) => `${step.id}-${index}`} emptyText={copy.noSteps} />
    </section>
    <section className="deployment-report-section">
      <h3>{copy.artifacts}</h3>
      <DataTable ariaLabel={copy.artifacts} rows={report.items} columns={artifactColumns} rowKey={item => item.id} emptyText={copy.noArtifacts} />
    </section>
  </DialogFrame>;
}
