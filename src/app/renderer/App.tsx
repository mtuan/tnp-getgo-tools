import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  BriefcaseBusiness,
  Check,
  Copy,
  CreditCard,
  FolderOpen,
  LayoutDashboard,
  Library,
  Images,
  MessageSquareWarning,
  LogIn,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Rocket,
  RotateCcw,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import type {
  AppSettings,
  SpeechLanguage,
  SpeechLanguageSettings,
  EnvironmentReadiness,
  QuizSummary,
} from "../../shared/domain/models";
import { defaultSpeechSettings } from "../../features/speech/domain/speech-settings";
import { useAuth } from "../../features/authentication/components/AuthContext";
import { AccountMenu } from "../../features/authentication/components/AccountMenu";
import { GetGoIcon } from "../../shared/components/GetGoIcon";
import { StartupLoadingScreen } from "../../shared/components/StartupLoadingScreen";
import { PageTransition } from "../../shared/components/PageTransition";
import { Button } from "../../shared/ui/Button";
import { DialogFrame } from "../../shared/ui/DialogFrame";
import { PageHeader } from "../../shared/ui/PageHeader";
import { Panel } from "../../shared/ui/Panel";
import { SummaryCard } from "../../shared/ui/SummaryCard";
import { Select, type SelectOption } from "../../shared/ui/Select";
import { SegmentedControl } from "../../shared/ui/SegmentedControl";
import { useToast } from "../../shared/ui/Toast";
import { FilesystemLegacyManager } from "../../features/topics/pages/FilesystemLegacyManager";
import { FilesystemContentV2Manager } from "../../features/topics/pages/FilesystemContentV2Manager";
import en from "../../shared/localization/en.json";
import vi from "../../shared/localization/vi.json";

const rendererStartedAt = performance.now();
const rendererStartupLog = (
  stage: string,
  details: Record<string, unknown> = {},
) =>
  console.info(
    `[GetGo Tools][Renderer startup][+${Math.round(performance.now() - rendererStartedAt)}ms] ${stage}`,
    details,
  );

const JobsPage = lazy(() =>
  import("../../features/jobs/pages/JobsPage").then((module) => ({ default: module.JobsPage })),
);
const QuestionFeedbackPage = lazy(() =>
  import("../../features/feedback/pages/QuestionFeedbackPage").then((module) => ({ default: module.QuestionFeedbackPage })),
);
const DeploymentPage = lazy(() =>
  import("../../features/deployment/pages/DeploymentPage").then((module) => ({
    default: module.DeploymentPage,
  })),
);
const ImagePdfPage = lazy(() =>
  import("../../features/image-pdf/pages/ImagePdfPage").then((module) => ({ default: module.ImagePdfPage })),
);
const PaymentPackagesPage = lazy(() => import("../../features/payment-packages/pages/PaymentPackagesPage").then((module) => ({ default: module.PaymentPackagesPage })));
const ContentSafetyPage = lazy(() => import("../../features/content-safety/pages/ContentSafetyPage").then((module) => ({ default: module.ContentSafetyPage })));

type View =
  | "dashboard"
  | "topics"
  | "quizzes"
  | "feedbacks"
  | "jobs"
  | "deploy"
  | "image-pdf"
  | "payments"
  | "safe-words"
  | "settings"
  | "not-found";
type NavigableView = Exclude<View, "not-found">;
const lastRouteKey = "getgo-tools:last-route";
const sidebarCollapsedKey = "getgo-tools:sidebar-collapsed";
const readLastRoute = () => {
  try {
    return localStorage.getItem(lastRouteKey) || "/dashboard";
  } catch {
    return "/dashboard";
  }
};
const readSidebarCollapsed = () => {
  try {
    return localStorage.getItem(sidebarCollapsedKey) === "true";
  } catch {
    return false;
  }
};
function viewFromRoute(route: string): View {
  let pathname: string;
  try {
    pathname = new URL(route, "app://getgo").pathname;
  } catch {
    pathname = route.split("?")[0];
  }
  const staticView = [
    "dashboard",
    "feedbacks",
    "jobs",
    "deploy",
    "image-pdf",
    "payments",
    "safe-words",
    "settings",
  ].find((value) => pathname === `/${value}`);
  if (staticView) return staticView as NavigableView;
  if (pathname === "/payment-packages") return "payments";
  if (pathname === "/feedback") return "feedbacks";
  const parts = pathname
    .split("/")
    .filter(Boolean)
    .map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    });
  if (parts[0] === "topics") {
    if (parts.length === 1) return "topics";
    if (parts.length === 2) return "topics";
    if (parts[2] !== "quizzes" || !parts[3]) return "not-found";
    if (parts.length === 4) return "topics";
    if (parts[4] !== "questions" || !parts[5] || parts.length !== 6)
      return "not-found";
    return "topics";
  }
  if (parts[0] !== "quizzes" || parts[1] !== "contests") return "not-found";
  if (parts.length === 2) return "quizzes";
  const contestId = parts[2];
  if (!contestId) return "not-found";
  if (parts.length === 3) return "quizzes";
  if (parts[3] !== "quizzes" || !parts[4]) return "not-found";
  if (parts.length === 5) return "quizzes";
  return parts.length === 7 && parts[5] === "questions" && Boolean(parts[6])
    ? "quizzes"
    : "not-found";
}
const normalizedRoute = (route: string) => {
  const value = route.trim();
  if (!value) return "/dashboard";
  return value.startsWith("/") ? value : `/${value}`;
};
const nav: { id: NavigableView; label: string; icon: LucideIcon }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "topics", label: "Topics", icon: Library },
  { id: "feedbacks", label: "Feedbacks", icon: MessageSquareWarning },
  { id: "quizzes", label: "Legacy quizzes", icon: Archive },
  { id: "jobs", label: "Jobs", icon: BriefcaseBusiness },
  { id: "deploy", label: "Deploy", icon: Rocket },
  { id: "image-pdf", label: "Image to PDF", icon: Images },
  { id: "payments", label: "Payments", icon: CreditCard },
  { id: "safe-words", label: "Safe words", icon: ShieldCheck },
  { id: "settings", label: "Settings", icon: Settings },
];
const environmentOptions: SelectOption[] = [
  { value: "development", label: "Development" },
  { value: "staging", label: "Staging" },
  { value: "production", label: "Production" },
];
const aiProfileOptions: SelectOption[] = [
  { value: "thorough", label: "Thorough" },
  { value: "fast", label: "Fast" },
];
const localeOptions: SelectOption[] = [
  { value: "en", label: "English" },
  { value: "vi", label: "Tiếng Việt" },
];

export function App() {
  const toast = useToast();
  const auth = useAuth();
  const [initialRoute] = useState(readLastRoute);
  const [view, setView] = useState<View>(() => viewFromRoute(initialRoute));
  const [settings, setSettings] = useState<AppSettings>({
    repositoryPath: null,
    environment: "development",
    aiProfile: "thorough",
    locale: "en",
    speech: structuredClone(defaultSpeechSettings),
  });
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const contentCopy = (settings.locale === "vi" ? vi : en).contentV2;
  const imagePdfCopy = (settings.locale === "vi" ? vi : en).imagePdf;
  const [loading, setLoading] = useState(true);
  const [choosingRepository, setChoosingRepository] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [repositoryError, setRepositoryError] = useState<string | null>(null);
  const [currentRoute, setCurrentRoute] = useState(initialRoute);
  const [routeDraft, setRouteDraft] = useState(initialRoute);
  const [routeRequest, setRouteRequest] = useState({
    route: initialRoute,
    key: 0,
  });
  const [routeCopied, setRouteCopied] = useState(false);
  const [environmentReadiness, setEnvironmentReadiness] =
    useState<EnvironmentReadiness | null>(null);
  const [checkingEnvironment, setCheckingEnvironment] = useState(false);
  const [savingAiProfile, setSavingAiProfile] = useState(false);
  const [restartingApp, setRestartingApp] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] =
    useState(readSidebarCollapsed);
  const [canNavigateBack, setCanNavigateBack] = useState(false);
  const environmentCheckId = useRef(0);
  const quizBackAction = useRef<(() => void) | null>(null);
  useEffect(() => window.getgo.onContentSafetyWarning((warning) => {
    const matches = warning.findings.slice(0, 4).map(item => `“${item.term}” at ${item.path}`).join("; ");
    toast.show({
      title: settings.locale === "vi" ? "Cảnh báo nội dung không phù hợp" : "Unsafe content warning",
      description: `${warning.label}: ${matches}${warning.findings.length > 4 ? `; +${warning.findings.length - 4}` : ""}`,
      variant: "error",
    });
  }), [settings.locale, toast]);

  async function choose() {
    setChoosingRepository(true);
    try {
      const result = await window.getgo.chooseRepository();
      if (result) {
        setSettings((s) => ({ ...s, repositoryPath: result }));
        setRepositoryError(null);
        toast.show({
          title: "Repository connected",
          description: result,
        });
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setRepositoryError(message);
    } finally {
      setChoosingRepository(false);
    }
  }
  async function changeEnvironment(environment: AppSettings["environment"]) {
    if (checkingEnvironment || environment === settings.environment) return;
    const previousSettings = settings;
    const checkId = ++environmentCheckId.current;
    setCheckingEnvironment(true);
    setEnvironmentReadiness(null);
    setSettings((current) => ({ ...current, environment }));
    let next: AppSettings;
    try {
      next = await window.getgo.setEnvironment(environment);
      if (checkId !== environmentCheckId.current) return;
      setSettings(next);
    } catch (cause) {
      if (checkId === environmentCheckId.current) {
        setSettings(previousSettings);
        setCheckingEnvironment(false);
      }
      toast.show({
        title: "Environment change failed",
        description: cause instanceof Error ? cause.message : String(cause),
        variant: "error",
      });
      return;
    }
    const readinessCheck = window.getgo.checkEnvironmentReadiness;
    if (typeof readinessCheck !== "function") {
      await auth.refresh();
      if (checkId === environmentCheckId.current) setCheckingEnvironment(false);
      toast.show({
        title: "Restart required",
        description:
          "Restart GetGo Tools to load environment readiness checks.",
        variant: "info",
      });
      return;
    }
    let readiness: EnvironmentReadiness;
    try {
      [, readiness] = await Promise.all([auth.refresh(), readinessCheck()]);
    } finally {
      if (checkId === environmentCheckId.current) setCheckingEnvironment(false);
    }
    if (checkId !== environmentCheckId.current) return;
    setEnvironmentReadiness(readiness);
    if (readiness.ready) {
      toast.show({
        title: "Environment ready",
        description: `${next.environment} is connected to ${readiness.projectId}.`,
      });
      return;
    }
    const issues = readiness.checks
      .filter((check) => !check.ready)
      .map((check) => check.message);
    toast.show({
      title: `${next.environment} is not ready`,
      description: issues.join(" "),
      variant: "error",
    });
  }
  async function changeAiProfile(profile: AppSettings["aiProfile"]) {
    setSavingAiProfile(true);
    try {
      const next = await window.getgo.setAiProfile(profile);
      setSettings(next);
      toast.show({
        title: "AI profile updated",
        description:
          profile === "fast"
            ? "Fast uses a compact prompt and low reasoning."
            : "Thorough uses the full reference and medium reasoning.",
      });
    } catch (cause) {
      toast.show({
        title: "Could not update AI profile",
        description: cause instanceof Error ? cause.message : String(cause),
        variant: "error",
      });
    } finally {
      setSavingAiProfile(false);
    }
  }
  async function changeLocale(locale: AppSettings["locale"]) {
    const next = await window.getgo.setLocale(locale);
    setSettings(next);
    document.documentElement.lang = locale;
  }
  async function changeSpeechSettings(
    language: SpeechLanguage,
    value: SpeechLanguageSettings,
  ) {
    const next = await window.getgo.setSpeechSettings(language, value);
    setSettings(next);
  }
  async function restartApp() {
    setRestartingApp(true);
    try {
      await window.getgo.restartApp();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setRestartingApp(false);
      toast.show({
        title: "Could not restart GetGo Tools",
        description: message,
        variant: "error",
      });
    }
  }
  useEffect(() => {
    rendererStartupLog("App mounted");
  }, []);
  useEffect(() => {
    window.getgo
      .getSettings()
      .then((value) => {
        rendererStartupLog("Settings received", {
          hasRepository: Boolean(value.repositoryPath),
        });
        setSettings(value);
        setSettingsLoaded(true);
        document.documentElement.lang = value.locale;
        if (typeof window.getgo.checkEnvironmentReadiness === "function") {
          const checkId = ++environmentCheckId.current;
          setCheckingEnvironment(true);
          void window.getgo
            .checkEnvironmentReadiness()
            .then((readiness) => {
              if (checkId === environmentCheckId.current)
                setEnvironmentReadiness(readiness);
            })
            .finally(() => {
              if (checkId === environmentCheckId.current)
                setCheckingEnvironment(false);
            });
        }
        setLoading(false);
      })
      .catch((cause) => {
        setSettingsLoaded(true);
        setError(String(cause));
        setLoading(false);
      });
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(lastRouteKey, currentRoute);
    } catch {
      /* Storage can be unavailable in hardened renderer sessions. */
    }
  }, [currentRoute]);
  useEffect(() => {
    setRouteDraft(currentRoute);
  }, [currentRoute]);
  useEffect(() => {
    try {
      localStorage.setItem(sidebarCollapsedKey, String(sidebarCollapsed));
    } catch {
      /* Storage can be unavailable in hardened renderer sessions. */
    }
  }, [sidebarCollapsed]);
  useEffect(() => {
    if (!routeCopied) return;
    const timeout = window.setTimeout(() => setRouteCopied(false), 1400);
    return () => window.clearTimeout(timeout);
  }, [routeCopied]);

  async function copyCurrentRoute() {
    try {
      await window.getgo.copyText(currentRoute);
      setRouteCopied(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }
  const updateQuizBackAction = useCallback((action: (() => void) | null) => {
    quizBackAction.current = action;
    setCanNavigateBack(Boolean(action));
  }, []);
  function goToRoute(route: string) {
    const nextRoute = normalizedRoute(route);
    const nextView = viewFromRoute(nextRoute);
    if (nextView !== "quizzes") updateQuizBackAction(null);
    setView(nextView);
    setCurrentRoute(nextRoute);
    setRouteRequest((request) => ({ route: nextRoute, key: request.key + 1 }));
  }
  function refreshCurrentRoute() {
    setRouteDraft(currentRoute);
    setRouteRequest((request) => ({
      route: currentRoute,
      key: request.key + 1,
    }));
  }
  function navigate(view: NavigableView) {
    goToRoute(view === "quizzes" ? "/quizzes/contests" : `/${view}`);
  }

  function environmentSwitcher(className?: string) {
    if (!settingsLoaded)
      return (
        <div
          className={["environment-switcher", className]
            .filter(Boolean)
            .join(" ")}
        >
          <span className="environment-loading" role="status">
            Loading target…
          </span>
        </div>
      );
    const failedChecks = environmentReadiness?.checks
      .filter((check) => !check.ready)
      .map((check) => check.message)
      .join(" ");
    const statusLabel = checkingEnvironment
      ? `Checking ${settings.environment}`
      : environmentReadiness?.ready
        ? `${settings.environment} is ready`
        : environmentReadiness
          ? `${settings.environment} is not ready. ${failedChecks}`
          : `${settings.environment} status is unknown`;
    const readinessClass = checkingEnvironment
      ? "environment-checking"
      : environmentReadiness?.ready
        ? "environment-ready"
        : environmentReadiness
          ? "environment-not-ready"
          : "environment-unknown";
    const selectColor = environmentReadiness?.ready
      ? "success"
      : environmentReadiness
        ? "danger"
        : "normal";
    return (
      <div
        className={["environment-switcher", className]
          .filter(Boolean)
          .join(" ")}
      >
        <Select
          title={statusLabel}
          color={selectColor}
          className={readinessClass}
          value={settings.environment}
          options={environmentOptions}
          disabled={checkingEnvironment}
          onValueChange={(value) =>
            void changeEnvironment(value as AppSettings["environment"])
          }
        />
      </div>
    );
  }

  const quizzes: QuizSummary[] = [];
  const built = quizzes.filter((q) => q.hasGeneratedArtifact).length;
  const ready = quizzes.filter((q) =>
    ["reviewed", "validated", "published"].includes(q.contentStatus),
  ).length;
  const contests = 0;

  if (loading)
    return <StartupLoadingScreen settingsLoaded={settingsLoaded} />;

  return (
    <div
      className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`.trim()}
    >
      <div className="routebar">
        <div className="route-address">
          <input
            className="route-value"
            value={routeDraft}
            aria-label="Application route"
            spellCheck={false}
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => setRouteDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                goToRoute(routeDraft);
                event.currentTarget.blur();
              } else if (event.key === "Escape") {
                event.preventDefault();
                setRouteDraft(currentRoute);
                event.currentTarget.blur();
              }
            }}
          />
          <div className="route-actions">
            <button
              type="button"
              onClick={refreshCurrentRoute}
              aria-label="Refresh route"
              title="Refresh route"
            >
              <RefreshCw size={16} />
            </button>
            <button
              type="button"
              onClick={() => void copyCurrentRoute()}
              aria-label={routeCopied ? "Route copied" : "Copy route"}
              title={routeCopied ? "Copied" : "Copy route"}
            >
              {routeCopied ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </div>
        </div>
      </div>
      <aside className="sidebar">
        <Button
          className="ui-page-header-folder sidebar-toggle"
          icon={sidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          variant="icon"
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={() => setSidebarCollapsed((value) => !value)}
        />
        <div className="brand">
          <div className="brand-mark">
            <GetGoIcon size={38} />
          </div>
          <div className="brand-copy">
            <strong>GetGo</strong>
            <span>TOOLS</span>
          </div>
        </div>
        <nav>
          {nav.map((item) => {
            const Icon = item.icon;
            const label =
              item.id === "topics"
                ? contentCopy.nav
                : item.id === "quizzes"
                  ? contentCopy.legacyNav
                  : item.id === "image-pdf"
                    ? imagePdfCopy.nav
                    : item.label;
            return (
              <button
                key={item.id}
                className={view === item.id ? "active" : ""}
                aria-label={label}
                title={sidebarCollapsed ? label : undefined}
                onClick={() => navigate(item.id)}
              >
                <i>
                  <Icon size={18} strokeWidth={1.8} />
                </i>
                <span>{label}</span>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <span className="sidebar-workspace">
            <span className="status-dot" />
            Local workspace
          </span>
          <strong>v0.1.0</strong>
        </div>
      </aside>
      <main>
        <header
          className={`topbar ${settings.environment === "production" ? "production-header" : ""}`}
        >
          <div className="topbar-leading">
            {canNavigateBack && (
              <Button
                className="ui-page-header-folder topbar-back"
                icon={<ArrowLeft />}
                variant="icon"
                aria-label="Go back"
                title="Go back"
                onClick={() => quizBackAction.current?.()}
              />
            )}
            <button className="repository" onClick={choose}>
              <span>Repository</span>
              <strong>
                {settings.repositoryPath?.split(/[\\/]/).pop() ??
                  "Choose folder"}
              </strong>
            </button>
          </div>
          <div className="top-actions">
            {environmentSwitcher("compact")}
            {auth.state.user ? (
              <AccountMenu user={auth.state.user} onSignOut={auth.signOut} />
            ) : (
              <Button disabled={auth.loading} onClick={auth.requestLogin}>
                <LogIn size={15} />
                Sign in
              </Button>
            )}
          </div>
        </header>
        <div className="content">
          <PageTransition
            key={routeRequest.key}
            trigger={[view, settings.repositoryPath]}
          >
            {error && (
              <div className="error-banner" role="alert">
                <strong>Application error</strong>
                <span>{error}</span>
                <button
                  className="error-banner-close"
                  type="button"
                  aria-label="Dismiss error"
                  onClick={() => setError(null)}
                >
                  ×
                </button>
              </div>
            )}
            {view === "not-found" && (
              <section className="empty-feature">
                <span className="eyebrow">Error 404</span>
                <h2>Page not found</h2>
                <p>
                  No GetGo Tools page matches <code>{currentRoute}</code>.
                </p>
                <Button variant="primary" onClick={() => navigate("dashboard")}>
                  Go to dashboard
                </Button>
              </section>
            )}
            {!settings.repositoryPath &&
            !loading &&
            view !== "not-found" &&
            view !== "image-pdf" ? (
              <section className="welcome">
                <div className="welcome-mark">
                  <GetGoIcon size={56} />
                </div>
                <h1>Connect your quiz repository</h1>
                <p>
                  Select the local <code>tnp-getgo-quizzes</code> folder to
                  inspect quiz lifecycle and build status.
                </p>
                <Button
                  loading={choosingRepository}
                  variant="primary"
                  onClick={() => void choose()}
                >
                  Choose repository
                </Button>
              </section>
            ) : null}
            {settings.repositoryPath && view === "dashboard" && (
              <>
                <PageHeader
                  eyebrow="Workspace overview"
                  title="Quiz operations"
                  description="Local repository health and publishing readiness."
                  actions={
                    <Button
                      variant="primary"
                      onClick={() => navigate("quizzes")}
                    >
                      Browse quizzes
                    </Button>
                  }
                />
                <section className="metrics">
                  <SummaryCard
                    label="Total quizzes"
                    value={quizzes.length}
                    detail={`across ${contests} contests`}
                  />
                  <SummaryCard
                    label="Ready to publish"
                    value={ready}
                    detail="reviewed or validated"
                  />
                  <SummaryCard
                    label="Local builds"
                    value={built}
                    detail={`${quizzes.length - built} require a build`}
                  />
                  <SummaryCard
                    label="Filesystem"
                    value={settings.repositoryPath ? 1 : 0}
                    detail="loaded on demand"
                  />
                </section>
                <Panel
                  title="Lifecycle distribution"
                  description="Current manifest status across the repository"
                  meta={
                    <>
                      Filesystem data loads with each page
                    </>
                  }
                >
                  <div className="lifecycle">
                    {[
                      "imported",
                      "normalized",
                      "generated",
                      "reviewed",
                      "validated",
                      "published",
                    ].map((status) => {
                      const count = quizzes.filter(
                        (q) => q.contentStatus === status,
                      ).length;
                      return (
                        <div key={status}>
                          <div>
                            <span>{status}</span>
                            <strong>{count}</strong>
                          </div>
                          <progress
                            max={Math.max(quizzes.length, 1)}
                            value={count}
                          />
                        </div>
                      );
                    })}
                  </div>
                </Panel>
              </>
            )}
            {settings.repositoryPath && view === "quizzes" && (
              <FilesystemLegacyManager
                locale={settings.locale}
                speechSettings={settings.speech}
                initialRoute={routeRequest.route}
                onRouteChange={setCurrentRoute}
                onOpenJobs={() => goToRoute("/jobs")}
                onBackActionChange={updateQuizBackAction}
                onSpeechSettingsChange={changeSpeechSettings}
              />
            )}
            {settings.repositoryPath && view === "topics" && (
              <FilesystemContentV2Manager
                locale={settings.locale}
                speechSettings={settings.speech}
                initialRoute={routeRequest.route}
                onRouteChange={setCurrentRoute}
                onOpenJobs={() => goToRoute("/jobs")}
                onBackActionChange={updateQuizBackAction}
                onSpeechSettingsChange={changeSpeechSettings}
              />
            )}
            {settings.repositoryPath && view === "feedbacks" && (
              <Suspense fallback={null}>
                <QuestionFeedbackPage
                  onOpenQuestion={(topicId, quizId, questionId) => {
                    const questionNo = questionId.replace(/^q/i, "");
                    goToRoute(`/topics/${encodeURIComponent(topicId)}/quizzes/${encodeURIComponent(quizId)}/questions/${encodeURIComponent(questionNo)}?tab=static`);
                  }}
                />
              </Suspense>
            )}
            {settings.repositoryPath && view === "jobs" && (
              <Suspense fallback={null}>
                <JobsPage
                  locale={settings.locale}
                  onOpenQuiz={(route) => goToRoute(route)}
                />
              </Suspense>
            )}
            {settings.repositoryPath && view === "deploy" && (
              <Suspense fallback={null}>
                <DeploymentPage
                  locale={settings.locale}
                  environment={settings.environment}
                  onOpenJobs={() => goToRoute("/jobs")}
                />
              </Suspense>
            )}
            {view === "image-pdf" && (
              <Suspense fallback={null}>
                <ImagePdfPage locale={settings.locale} />
              </Suspense>
            )}
            {settings.repositoryPath && view === "payments" && (
              <Suspense fallback={null}><PaymentPackagesPage locale={settings.locale} initialRoute={routeRequest.route} onRouteChange={setCurrentRoute} /></Suspense>
            )}
            {settings.repositoryPath && view === "safe-words" && (
              <Suspense fallback={null}><ContentSafetyPage locale={settings.locale} /></Suspense>
            )}
            {settings.repositoryPath && view === "settings" && (
              <section className="settings-page">
                <span className="eyebrow">Application</span>
                <h1>Settings</h1>
                <div className="settings-card">
                  <label>
                    Quiz repository
                    <span>
                      The folder containing quizzes/, generated/, and schemas/.
                    </span>
                  </label>
                  <div>
                    <code>{settings.repositoryPath}</code>
                    <button
                      className="secondary"
                      disabled={loading}
                      onClick={choose}
                    >
                      Change
                    </button>
                  </div>
                  <label>
                    Active environment
                    <span>
                      Upload status will be reconciled independently for every
                      environment.
                    </span>
                  </label>
                  <SegmentedControl
                    value={settings.environment}
                    options={environmentOptions}
                    disabled={checkingEnvironment}
                    ariaLabel="Active environment"
                    onValueChange={(value) =>
                      void changeEnvironment(
                        value as AppSettings["environment"],
                      )
                    }
                  />
                  <label>
                    Locale
                    <span>
                      Choose the language used by localized application pages.
                    </span>
                  </label>
                  <SegmentedControl
                    value={settings.locale}
                    options={localeOptions}
                    ariaLabel="Locale"
                    onValueChange={(value) =>
                      void changeLocale(value as AppSettings["locale"])
                    }
                  />
                  <label>
                    AI generation profile
                    <span>
                      Thorough preserves the current full-reference behavior.
                      Fast uses a compact reference and lower reasoning latency.
                    </span>
                  </label>
                  <SegmentedControl
                    value={settings.aiProfile}
                    options={aiProfileOptions}
                    disabled={savingAiProfile}
                    ariaLabel="AI generation profile"
                    onValueChange={(value) =>
                      void changeAiProfile(value as AppSettings["aiProfile"])
                    }
                  />
                  <label>
                    Restart application
                    <span>
                      Development restarts keep the Vite hot-update connection
                      active. Packaged builds relaunch GetGo Tools.
                    </span>
                  </label>
                  <div>
                    <Button
                      icon={<RotateCcw size={15} />}
                      loading={restartingApp}
                      variant="secondary"
                      onClick={() => void restartApp()}
                    >
                      Restart GetGo Tools
                    </Button>
                  </div>
                </div>
              </section>
            )}
          </PageTransition>
        </div>
      </main>
      {routeCopied && (
        <div className="copy-toast" role="status" aria-live="polite">
          <Check size={16} />
          Route copied
        </div>
      )}
      {repositoryError && (
        <DialogFrame
          presentation="modal"
          className="repository-error-dialog"
          hideFooter
          title="Could not open repository"
          busy={choosingRepository}
          error={null}
          onClose={() => setRepositoryError(null)}
          onSubmit={(event) => event.preventDefault()}
        >
          <div className="repository-error-content">
            <i>
              <AlertTriangle />
            </i>
            <div>
              <strong>
                The selected folder is not a valid quiz repository.
              </strong>
              <span>{repositoryError}</span>
            </div>
          </div>
          <div className="repository-error-actions">
            <Button
              disabled={choosingRepository}
              onClick={() => setRepositoryError(null)}
            >
              Close
            </Button>
            <Button
              icon={<FolderOpen size={15} />}
              loading={choosingRepository}
              variant="solid"
              onClick={() => void choose()}
            >
              Choose another folder
            </Button>
          </div>
        </DialogFrame>
      )}
      {loading && (
        <div className="loading">
          <span />
          Loading files…
        </div>
      )}
    </div>
  );
}
