import type { FormEvent } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import type { AppSettings, WebBuildReadiness } from "../../../shared/domain/models";
import * as ui from "../../../shared/ui";
import en from "../../../shared/localization/en.json";
import vi from "../../../shared/localization/vi.json";

interface Props {
  locale: AppSettings["locale"];
  readiness: WebBuildReadiness | null;
  error: string | null;
  busy: boolean;
  checking: boolean;
  fields: ui.FormSchema[];
  values: ui.FormValues;
  onValuesChange(name: string, value: unknown): void;
  onRefresh(): void;
  onClose(): void;
  onSubmit(event: FormEvent): void;
}

export function WebReleaseBuildDialog(props: Props) {
  const copy = (props.locale === "vi" ? vi : en).deployment.releaseManager;
  const loading = props.readiness === null && props.error === null;
  const dirty = props.readiness?.repositories.filter(repository => repository.changes.length > 0) ?? [];
  const changedCount = dirty.reduce((total, repository) => total + repository.changes.length, 0);
  const breakdown = dirty.map(repository => copy.repositoryChangeCount
    .replace("{repository}", copy.buildRepositories[repository.id])
    .replace("{count}", String(repository.changes.length))).join(" · ");

  return <ui.DialogFrame
    presentation="modal"
    title={copy.buildDialogTitle}
    busy={props.busy}
    error={null}
    cancelLabel={copy.cancel}
    submitLabel={copy.build}
    submitDisabled={!props.readiness?.ready}
    hideFooter={loading}
    onClose={props.onClose}
    onSubmit={props.onSubmit}
  >
    {loading ? <ui.PageLoading label={copy.checkingBuildReadiness} /> : props.readiness ? <>
      {props.error && props.readiness.ready && <article className="release-readiness-item release-doctor-check-action-required">
        <span className="release-doctor-icon" aria-hidden="true"><AlertTriangle /></span>
        <div className="release-readiness-content"><h3>{copy.buildCouldNotStart}</h3><p>{copy.buildCouldNotStartDescription}</p></div>
      </article>}
      <section className="release-readiness">
        <div className="release-readiness-heading">
          <div><h3>{copy.sourceCheckTitle}</h3><p>{props.readiness.ready ? copy.sourceReady : copy.sourceBlocked}</p></div>
          <ui.Button variant="icon" icon={<RefreshCw />} aria-label={copy.checkAgain} title={copy.checkAgain} loading={props.checking} disabled={props.busy} onClick={props.onRefresh} />
        </div>
        <div className="release-readiness-list">
          {props.readiness.ready ? <article className="release-readiness-item release-doctor-check-ready">
            <span className="release-doctor-icon" aria-hidden="true"><CheckCircle2 /></span>
            <div className="release-readiness-content"><h3>{copy.cleanSource}</h3><p>{copy.cleanSourceDescription}</p></div>
            <ui.StatusBadge tone="success">{copy.ready}</ui.StatusBadge>
          </article> : <article className="release-readiness-item release-doctor-check-action-required">
            <span className="release-doctor-icon" aria-hidden="true"><AlertTriangle /></span>
            <div className="release-readiness-content">
              <h3>{copy.unsavedWork}</h3>
              <p>{copy.unsavedWorkSummary.replace("{count}", String(changedCount)).replace("{breakdown}", breakdown)}</p>
            </div>
          </article>}
        </div>
      </section>
      {props.readiness.ready && <ui.Form fields={props.fields} values={props.values} onChange={props.onValuesChange} />}
    </> : <article className="release-readiness-item release-doctor-check-action-required">
      <span className="release-doctor-icon" aria-hidden="true"><AlertTriangle /></span>
      <div className="release-readiness-content"><h3>{copy.buildReadinessFailedTitle}</h3><p>{copy.buildReadinessFailed}</p></div>
      <ui.Button variant="solid" color="warning" icon={<RefreshCw />} loading={props.checking} onClick={props.onRefresh}>{copy.checkAgain}</ui.Button>
    </article>}
  </ui.DialogFrame>;
}
