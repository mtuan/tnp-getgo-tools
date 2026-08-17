import { useEffect, useState } from "react";
import type { AppSettings, RepositoryViewData, SpeechLanguage, SpeechLanguageSettings } from "../../../shared/domain/models";
import { ContentV2QuizManager } from "./ContentV2QuizManager";

type Props = {
  locale: AppSettings["locale"];
  speechSettings: AppSettings["speech"];
  initialRoute: string;
  onRouteChange(route: string): void;
  onOpenJobs(): void;
  onBackActionChange(action: (() => void) | null): void;
  onSpeechSettingsChange(language: SpeechLanguage, settings: SpeechLanguageSettings): Promise<void>;
};

function managerData(data: Awaited<ReturnType<typeof window.getgo.loadContentV2Route>>): RepositoryViewData {
  return {
    repositoryPath: data.repositoryPath,
    loadedAt: data.loadedAt,
    contests: [],
    quizzes: [],
    issues: data.content.issues,
    contentV2: data.content,
  };
}

function topicIdFromRoute(route: string): string | undefined {
  const match = /^\/topics\/([a-z][a-z0-9-]*)(?:\/|$)/.exec(route);
  return match?.[1];
}

export function FilesystemContentV2Manager(props: Props) {
  const [data, setData] = useState<RepositoryViewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const initialTopicId = topicIdFromRoute(props.initialRoute);
  useEffect(() => {
    let active = true;
    setError(null);
    // A detail route reads only its topic folder. Never load the repository
    // overview first: doing both creates avoidable work and delays two-quiz
    // topics behind hundreds of unrelated quiz manifests.
    void window.getgo.loadContentV2Route(initialTopicId).then((loaded) => {
      if (active) setData(managerData(loaded));
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : String(cause));
    });
    return () => { active = false; };
  }, [initialTopicId]);
  if (error) return <div className="ui-error-frame">{error}</div>;
  if (!data) return <div className="manager-loading">Loading topic files…</div>;
  return <ContentV2QuizManager {...props} snapshot={data} onSnapshotChange={setData} />;
}
