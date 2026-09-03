import { useEffect, useState } from "react";
import { Bug, RotateCcw } from "lucide-react";
import type { AppSettings } from "../../../shared/domain/models";
import type { StartupEnvironmentReadiness } from "../domain/startup-environment";
import * as ui from "../../../shared/ui";
import { StartupEnvironmentPage } from "./StartupEnvironmentPage";
import en from "../../../shared/localization/en.json";
import vi from "../../../shared/localization/vi.json";

const environmentOptions = [
  { value: "development", label: "Development" },
  { value: "staging", label: "Staging" },
  { value: "production", label: "Production" },
];
const localeOptions = [{ value: "en", label: "English" }, { value: "vi", label: "Tiếng Việt" }];
const aiProfileOptions = [{ value: "thorough", label: "Thorough" }, { value: "fast", label: "Fast" }];
type SettingsTab = "application" | "debug";
const tabFromRoute = (route: string): SettingsTab => {
  try { return new URL(route, "app://getgo").searchParams.get("tab") === "debug" && import.meta.env.DEV ? "debug" : "application"; }
  catch { return "application"; }
};

export function SettingsPage({ settings, initialRoute, loading, choosingRepository, checkingEnvironment, savingAiProfile, restartingApp, onRouteChange, onChooseRepository, onChangeEnvironment, onChangeLocale, onChangeAiProfile, onRestart }: {
  settings: AppSettings;
  initialRoute: string;
  loading: boolean;
  choosingRepository: boolean;
  checkingEnvironment: boolean;
  savingAiProfile: boolean;
  restartingApp: boolean;
  onRouteChange(route: string): void;
  onChooseRepository(): void;
  onChangeEnvironment(value: AppSettings["environment"]): void;
  onChangeLocale(value: AppSettings["locale"]): void;
  onChangeAiProfile(value: AppSettings["aiProfile"]): void;
  onRestart(): void;
}) {
  const copy = (settings.locale === "vi" ? vi : en).startupEnvironment;
  const [tab, setTab] = useState<SettingsTab>(() => tabFromRoute(initialRoute));
  const [mock, setMock] = useState<StartupEnvironmentReadiness | null>(null);
  const [loadingMock, setLoadingMock] = useState(false);
  const [mockError, setMockError] = useState<string | null>(null);
  useEffect(() => setTab(tabFromRoute(initialRoute)), [initialRoute]);
  const changeTab = (value: SettingsTab) => {
    setTab(value);
    onRouteChange(`/settings?tab=${value}`);
  };
  async function showMock() {
    setLoadingMock(true); setMockError(null);
    try { setMock(await window.getgo.checkStartupEnvironment(true)); }
    catch (cause) { setMockError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setLoadingMock(false); }
  }
  if (mock) return <StartupEnvironmentPage locale={settings.locale} readiness={mock} checking={false} restarting={false} preview onClose={() => setMock(null)} onRecheck={async () => undefined} onOpenConfiguration={() => undefined} onRestart={() => undefined} />;
  return <section className="settings-page">
    <span className="eyebrow">{copy.settingsEyebrow}</span>
    <h1>{copy.settingsTitle}</h1>
    <ui.Tabs<SettingsTab> value={tab} onChange={changeTab} ariaLabel={copy.settingsTabs} variant="underline" items={[
      { id: "application", label: copy.applicationTab },
      ...(import.meta.env.DEV ? [{ id: "debug" as const, label: copy.debugTitle }] : []),
    ]} />
    <ui.TabPanels<SettingsTab> value={tab} preserveMounted={false} className="settings-tab-panels" items={[{
      id: "application",
      content: <div className="settings-card">
      <label>Quiz repository<span>The folder containing quizzes/, generated/, and schemas/.</span></label>
      <div><code>{settings.repositoryPath}</code><button className="secondary" disabled={loading || choosingRepository} onClick={onChooseRepository}>Change</button></div>
      <label>Active environment<span>Upload status will be reconciled independently for every environment.</span></label>
      <ui.SegmentedControl value={settings.environment} options={environmentOptions} disabled={checkingEnvironment} ariaLabel="Active environment" onValueChange={value => onChangeEnvironment(value as AppSettings["environment"])} />
      <label>Locale<span>Choose the language used by localized application pages.</span></label>
      <ui.SegmentedControl value={settings.locale} options={localeOptions} ariaLabel="Locale" onValueChange={value => onChangeLocale(value as AppSettings["locale"])} />
      <label>AI generation profile<span>Thorough preserves the current full-reference behavior. Fast uses a compact reference and lower reasoning latency.</span></label>
      <ui.SegmentedControl value={settings.aiProfile} options={aiProfileOptions} disabled={savingAiProfile} ariaLabel="AI generation profile" onValueChange={value => onChangeAiProfile(value as AppSettings["aiProfile"])} />
      <label>Restart application<span>Development restarts keep the Vite hot-update connection active. Packaged builds relaunch GetGo Tools.</span></label>
      <div><ui.Button icon={<RotateCcw />} loading={restartingApp} variant="secondary" onClick={onRestart}>Restart GetGo Tools</ui.Button></div>
    </div>,
    }, ...(import.meta.env.DEV ? [{
      id: "debug" as const,
      content: <><ui.Panel><ui.PanelBody className="settings-debug-panel">
        <div><strong>{copy.mockTitle}</strong><span>{copy.mockDescription}</span></div>
        <ui.Button icon={<Bug />} loading={loadingMock} onClick={() => void showMock()}>{copy.showMock}</ui.Button>
      </ui.PanelBody></ui.Panel>
      {mockError && <ui.ErrorFrame message={mockError} />}</>,
    }] : [])]} />
  </section>;
}
