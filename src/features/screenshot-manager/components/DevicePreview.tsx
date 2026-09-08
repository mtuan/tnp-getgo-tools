import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Camera, Globe2, RefreshCw } from "lucide-react";
import * as ui from "../../../shared/ui";
import en from "../../../shared/localization/en.json";
import vi from "../../../shared/localization/vi.json";
import type { CapturedDomSnapshot, ScreenshotProject } from "../domain/screenshot-project";

interface DeviceWebview extends HTMLElement {
  capturePage(): Promise<{ toDataURL(): string }>;
  canGoBack(): boolean;
  canGoForward(): boolean;
  getTitle(): string;
  getURL(): string;
  goBack(): void;
  goForward(): void;
  loadURL(url: string): Promise<void>;
  reload(): void;
  executeJavaScript<T>(code: string): Promise<T>;
}

const normalizeLocalUrl = (value: string): string | null => {
  const candidate = /^[a-z]+:\/\//i.test(value.trim()) ? value.trim() : `http://${value.trim()}`;
  try {
    const url = new URL(candidate);
    if (!["http:", "https:"].includes(url.protocol) || !["localhost", "127.0.0.1", "::1"].includes(url.hostname)) return null;
    return url.toString();
  } catch { return null; }
};

const screenshotRoute = (value: string) => {
  const url = new URL(value);
  return `${url.pathname}${url.search}${url.hash}` || "/";
};

const clientNavigateScript = (route: string) => `(async () => {
  const route = ${JSON.stringify(route)};
  if (window.__GETGO_DESIGN_NAVIGATE__) return await window.__GETGO_DESIGN_NAVIGATE__(route);
  const target = new URL(route, location.href);
  if (target.origin !== location.origin) return false;
  const next = target.pathname + target.search + target.hash;
  history.pushState(history.state, "", next);
  window.dispatchEvent(new PopStateEvent("popstate", { state: history.state }));
  return true;
})()`;

export interface AutomaticCaptureProgress {
  completed: number;
  total: number;
  route: string;
  orientation: "portrait" | "landscape";
  theme: "light" | "dark";
  skipped?: boolean;
}

export interface DevicePreviewHandle {
  captureAll(pages: { route: string; name: string; capturedVariants: string[] }[], onProgress: (progress: AutomaticCaptureProgress) => void, missingOnly?: boolean): Promise<{ skipped: number }>;
  cancelAutomaticCapture(): void;
}

export const DevicePreview = forwardRef<DevicePreviewHandle, { locale: "en" | "vi"; project: ScreenshotProject; requestedRoute?: { route: string; key: number }; resetKey: number; onProjectChange(project: ScreenshotProject): void; onOrientationChange(orientation: "portrait" | "landscape"): Promise<void>; onScaleChange(scale: number): void; onCaptured?(route: string): void }>(function DevicePreview({ locale, project, requestedRoute, resetKey, onProjectChange, onOrientationChange, onScaleChange, onCaptured }, ref) {
  const copy = (locale === "vi" ? vi : en).screenshotManager.devicePreview;
  const width = project.previewConfig.width;
  const height = project.previewConfig.height;
  const [draftUrl, setDraftUrl] = useState(project.previewConfig.baseUrl);
  const [currentUrl, setCurrentUrl] = useState(draftUrl);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [navigation, setNavigation] = useState({ back: false, forward: false });
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const stageRef = useRef<HTMLDivElement>(null);
  const webviewRef = useRef<DeviceWebview | null>(null);
  const automaticCaptureRef = useRef(false);
  const automaticCaptureCancelledRef = useRef(false);
  const toast = ui.useToast();

  const updateNavigation = () => {
    const webview = webviewRef.current;
    if (!webview) return;
    const url = webview.getURL();
    if (url) { setCurrentUrl(url); setDraftUrl(url); }
    setNavigation({ back: webview.canGoBack(), forward: webview.canGoForward() });
  };
  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;
    const started = () => setLoading(true);
    const domReady = () => { setReady(true); updateNavigation(); };
    const stopped = () => { setLoading(false); updateNavigation(); };
    const failed = () => setLoading(false);
    webview.addEventListener("dom-ready", domReady);
    webview.addEventListener("did-start-loading", started);
    webview.addEventListener("did-stop-loading", stopped);
    webview.addEventListener("did-navigate", updateNavigation);
    webview.addEventListener("did-navigate-in-page", updateNavigation);
    webview.addEventListener("page-title-updated", updateNavigation);
    webview.addEventListener("did-fail-load", failed);
    return () => {
      webview.removeEventListener("dom-ready", domReady);
      webview.removeEventListener("did-start-loading", started);
      webview.removeEventListener("did-stop-loading", stopped);
      webview.removeEventListener("did-navigate", updateNavigation);
      webview.removeEventListener("did-navigate-in-page", updateNavigation);
      webview.removeEventListener("page-title-updated", updateNavigation);
      webview.removeEventListener("did-fail-load", failed);
    };
  }, []);
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const container = stage.parentElement;
    if (!container) return;
    if (project.previewConfig.sizeMode === "default") {
      setScale(1);
      onScaleChange(1);
      return;
    }
    const fit = () => {
      const availableWidth = container.clientWidth;
      const availableHeight = Math.max(1, container.clientHeight);
      const next = Math.min(1, availableWidth / width, availableHeight / (height + 52));
      setScale(next);
      onScaleChange(next);
    };
    const observer = new ResizeObserver(fit);
    observer.observe(container);
    window.addEventListener("resize", fit);
    fit();
    return () => { observer.disconnect(); window.removeEventListener("resize", fit); };
  }, [height, onScaleChange, project.previewConfig.sizeMode, width]);

  useEffect(() => {
    setDraftUrl(project.previewConfig.baseUrl);
    setCurrentUrl(project.previewConfig.baseUrl);
  }, [project.previewConfig.baseUrl]);
  useEffect(() => {
    if (!requestedRoute || !ready || automaticCaptureRef.current) return;
    const next = new URL(requestedRoute.route, `${project.previewConfig.baseUrl}/`).toString();
    setDraftUrl(next);
    setError(null);
    let cancelled = false;
    void webviewRef.current?.executeJavaScript<boolean>(clientNavigateScript(requestedRoute.route)).then(navigated => {
      if (!cancelled && !navigated) setError(copy.navigationUnavailable);
    }).catch(cause => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
    });
    return () => { cancelled = true; };
  }, [copy.navigationUnavailable, project.previewConfig.baseUrl, ready, requestedRoute?.key, requestedRoute?.route]);
  useEffect(() => {
    if (resetKey > 0 && ready) webviewRef.current?.reload();
  }, [ready, resetKey]);
  const navigate = async (event: FormEvent) => {
    event.preventDefault();
    const next = normalizeLocalUrl(draftUrl);
    if (!next) { setError(copy.localOnly); return; }
    setError(null);
    const current = webviewRef.current?.getURL();
    if (current && new URL(current).origin === new URL(next).origin) {
      const route = screenshotRoute(next);
      const navigated = await webviewRef.current?.executeJavaScript<boolean>(clientNavigateScript(route));
      if (navigated) return;
    }
    await webviewRef.current?.loadURL(next);
  };
  const captureCurrent = async (showToast: boolean, expectedName?: string) => {
    const webview = webviewRef.current;
    if (!webview) throw new Error(copy.navigationUnavailable);
    setCapturing(true); setError(null);
    try {
      const detected = await webview.executeJavaScript<{ route?: string; name?: string; orientation?: "portrait" | "landscape"; theme?: "light" | "dark"; domSnapshot?: CapturedDomSnapshot }>(
        `(async () => { let freeze = document.getElementById("__getgo-capture-freeze"); if (!freeze) { freeze = document.createElement("style"); freeze.id = "__getgo-capture-freeze"; freeze.textContent = "*,*::before,*::after{animation-play-state:paused!important;transition:none!important;caret-color:transparent!important}html{scroll-behavior:auto!important}"; document.head.appendChild(freeze); } await document.fonts?.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); return window.__GETGO_DESIGN_CAPTURE__?.() ?? ({ route: location.pathname + location.search + location.hash, name: document.title, orientation: innerWidth > innerHeight ? "landscape" : "portrait", theme: document.documentElement.classList.contains("dark") || document.documentElement.dataset.theme === "dark" || getComputedStyle(document.documentElement).colorScheme === "dark" ? "dark" : "light" }); })()`,
      );
      const image = await webview.capturePage();
      await webview.executeJavaScript(`document.getElementById("__getgo-capture-freeze")?.remove()`);
      const url = webview.getURL() || currentUrl;
      const route = detected.route || screenshotRoute(url);
      const pageTitle = expectedName?.trim() || detected.name?.trim() || webview.getTitle().trim() || route;
      const orientation = detected.orientation || (width > height ? "landscape" : "portrait");
      const theme = detected.theme === "dark" ? "dark" : "light";
      const next = await window.getgo.addScreenshot(project.id, image.toDataURL(), {
        name: pageTitle,
        route,
        orientation,
        theme,
        description: `${orientation} · ${theme} · ${width} × ${height} · ${new URL(url).origin}`,
      }, detected.domSnapshot);
      onProjectChange(next);
      onCaptured?.(route);
      if (showToast) toast.show({ title: copy.captured, description: `${pageTitle} · ${orientation} · ${theme}` });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      throw cause;
    }
    finally { void webview.executeJavaScript(`document.getElementById("__getgo-capture-freeze")?.remove()`); setCapturing(false); }
  };

  const waitForOrientation = async (orientation: "portrait" | "landscape") => {
    const webview = webviewRef.current;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (automaticCaptureCancelledRef.current) throw new Error("AUTOMATIC_CAPTURE_CANCELLED");
      await new Promise(resolve => window.setTimeout(resolve, 50));
      const size = await webview?.executeJavaScript<{ width: number; height: number }>(`({ width: innerWidth, height: innerHeight })`);
      if (size && (orientation === "portrait" ? size.width < size.height : size.width > size.height)) return;
    }
    throw new Error(copy.orientationChangeFailed);
  };

  const waitForPageReady = (webview: DeviceWebview) =>
    webview.executeJavaScript<boolean>(`window.__GETGO_DESIGN_WAIT_READY__?.() ?? Promise.resolve(true)`);

  const setTheme = (webview: DeviceWebview, theme: "light" | "dark") =>
    webview.executeJavaScript<boolean>(`window.__GETGO_DESIGN_SET_THEME__?.(${JSON.stringify(theme)}) ?? Promise.resolve(false)`);

  useImperativeHandle(ref, () => ({
    cancelAutomaticCapture() { automaticCaptureCancelledRef.current = true; },
    async captureAll(pages, onProgress, missingOnly = false) {
      const webview = webviewRef.current;
      if (!webview || !ready) throw new Error(copy.navigationUnavailable);
      automaticCaptureRef.current = true;
      automaticCaptureCancelledRef.current = false;
      const originalTheme = await webview.executeJavaScript<"light" | "dark">(
        `document.documentElement.classList.contains("dark") ? "dark" : "light"`,
      );
      const total = missingOnly ? pages.reduce((count, page) => count + 4 - page.capturedVariants.length, 0) : pages.length * 4;
      let completed = 0;
      let skipped = 0;
      try {
        for (const orientation of ["portrait", "landscape"] as const) {
          if (missingOnly && !pages.some(page => ["light", "dark"].some(theme => !page.capturedVariants.includes(`${orientation}-${theme}`)))) continue;
          await onOrientationChange(orientation);
          await waitForOrientation(orientation);
          for (const theme of ["light", "dark"] as const) {
            if (missingOnly && !pages.some(page => !page.capturedVariants.includes(`${orientation}-${theme}`))) continue;
            if (automaticCaptureCancelledRef.current) throw new Error("AUTOMATIC_CAPTURE_CANCELLED");
            const changed = await setTheme(webview, theme);
            if (!changed) throw new Error(copy.automationUnavailable);
            for (const page of pages) {
              const { route } = page;
              if (missingOnly && page.capturedVariants.includes(`${orientation}-${theme}`)) continue;
              if (automaticCaptureCancelledRef.current) throw new Error("AUTOMATIC_CAPTURE_CANCELLED");
              try {
                const navigated = await webview.executeJavaScript<boolean>(clientNavigateScript(route));
                if (!navigated) throw new Error(copy.navigationUnavailable);
                await waitForPageReady(webview);
                const themeRetained = await setTheme(webview, theme);
                if (!themeRetained) throw new Error(copy.automationUnavailable);
                await captureCurrent(false, page.name);
                completed += 1;
                onProgress({ completed, total, route, orientation, theme });
              } catch (cause) {
                if (automaticCaptureCancelledRef.current || (cause instanceof Error && cause.message === "AUTOMATIC_CAPTURE_CANCELLED")) throw cause;
                skipped += 1;
                completed += 1;
                onProgress({ completed, total, route, orientation, theme, skipped: true });
                console.warn("[Screenshot automation] Skipping capture slot", { route, orientation, theme, cause });
              }
            }
          }
        }
      } finally {
        automaticCaptureRef.current = false;
        await webview.executeJavaScript(
          `window.__GETGO_DESIGN_SET_THEME__?.(${JSON.stringify(originalTheme)}) ?? Promise.resolve(false)`,
        ).catch(() => undefined);
      }
      return { skipped };
    },
  }), [copy.automationUnavailable, copy.navigationUnavailable, copy.orientationChangeFailed, onOrientationChange, ready]);

  const capture = async () => { await captureCurrent(true).catch(() => undefined); };

  return <div className="device-preview">
    {error && <ui.ErrorFrame message={error} onDismiss={() => setError(null)} />}
    <div className="device-preview-stage" ref={stageRef} style={{ height: Math.ceil((height + 52) * scale), "--device-preview-width": `${width}px` } as CSSProperties}>
      <div className="device-browser" style={{ width, height: height + 52, transform: `scale(${scale})` }}>
        <form className="device-browser-bar" onSubmit={event => void navigate(event)}>
          <ui.Button variant="icon" icon={<ArrowLeft />} aria-label={copy.back} disabled={!ready || !navigation.back} onClick={() => webviewRef.current?.goBack()} />
          <ui.Button variant="icon" icon={<ArrowRight />} aria-label={copy.forward} disabled={!ready || !navigation.forward} onClick={() => webviewRef.current?.goForward()} />
          <ui.Button variant="icon" icon={<RefreshCw />} aria-label={copy.reload} disabled={!ready} onClick={() => webviewRef.current?.reload()} />
          <ui.Input leftIcon={<Globe2 />} value={draftUrl} aria-label={copy.address} onChange={event => setDraftUrl(event.target.value)} />
          <ui.Button variant="primary" icon={<Camera />} loading={capturing} disabled={!ready || loading} aria-label={copy.capture} title={copy.capture} onClick={() => void capture()} />
        </form>
        <webview ref={element => { webviewRef.current = element as DeviceWebview | null; }} className="device-browser-webview" src={project.previewConfig.baseUrl} partition="persist:getgo-device-preview" />
      </div>
    </div>
  </div>;
});
