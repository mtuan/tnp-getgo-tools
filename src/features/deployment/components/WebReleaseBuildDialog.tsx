import type { FormEvent } from "react";
import { RefreshCw } from "lucide-react";
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
  const blockedSummary = (dirty.length === 1 ? copy.pendingChangesSingle : copy.pendingChangesMultiple)
    .replace("{count}", String(changedCount))
    .replace("{repository}", dirty[0] ? copy.buildRepositories[dirty[0].id] : "")
    .replace("{breakdown}", breakdown);
  const blocked = !loading && props.readiness?.ready !== true;
  const title = props.readiness?.ready
    ? props.error ? copy.buildCouldNotStart : copy.buildDialogTitle
    : loading ? copy.buildDialogTitle
      : props.readiness ? copy.saveChangesTitle : copy.buildReadinessFailedTitle;

  return <ui.DialogFrame
    presentation="modal"
    className="release-build-dialog"
    title={title}
    busy={props.busy}
    error={null}
    cancelLabel={copy.cancel}
    submitLabel={copy.build}
    submitDisabled={!props.readiness?.ready}
    hideFooter={loading}
    footer={blocked ?
      <ui.Button variant="solid" icon={<RefreshCw />} loading={props.checking} onClick={props.onRefresh}>{copy.checkAgain}</ui.Button>
      : undefined}
    onClose={props.onClose}
    onSubmit={props.onSubmit}
  >
    {loading ? <ui.PageLoading className="release-build-loading" label={copy.checkingBuildReadiness} /> : props.readiness?.ready ? <>
      {props.error && <p className="release-build-message">{copy.buildCouldNotStartDescription}</p>}
      <ui.Form fields={props.fields} values={props.values} onChange={props.onValuesChange} />
    </> : <p className="release-build-message">{props.readiness ? blockedSummary : copy.buildReadinessFailed}</p>}
  </ui.DialogFrame>;
}
