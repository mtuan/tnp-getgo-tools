import { useEffect, useState } from "react";
import type { AppSettings, RepositoryViewData, SpeechLanguage, SpeechLanguageSettings } from "../../../shared/domain/models";
import { QuizManager } from "./QuizManager";

type Props = {
  locale: AppSettings["locale"];
  speechSettings: AppSettings["speech"];
  initialRoute: string;
  onRouteChange(route: string): void;
  onOpenJobs(): void;
  onBackActionChange(action: (() => void) | null): void;
  onSpeechSettingsChange(language: SpeechLanguage, settings: SpeechLanguageSettings): Promise<void>;
};

export function FilesystemLegacyManager(props: Props) {
  const [data, setData] = useState<RepositoryViewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setError(null);
    void window.getgo.loadLegacyOverview().then((loaded) => {
      if (active) setData(loaded);
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : String(cause));
    });
    return () => { active = false; };
  }, [props.initialRoute]);
  if (error) return <div className="ui-error-frame">{error}</div>;
  if (!data) return <div className="manager-loading">Loading quiz folders…</div>;
  return <QuizManager {...props} snapshot={data} onSnapshotChange={setData} />;
}
