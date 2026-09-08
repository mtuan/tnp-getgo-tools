import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Camera, Globe2, RefreshCw } from "lucide-react";
import * as ui from "../../../shared/ui";
import en from "../../../shared/localization/en.json";
import vi from "../../../shared/localization/vi.json";
import type { ScreenshotProject } from "../domain/screenshot-project";

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

export function DevicePreview({ locale, project, requestedRoute, resetKey, onProjectChange, onScaleChange, onCaptured }: { locale: "en" | "vi"; project: ScreenshotProject; requestedRoute?: { route: string; key: number }; resetKey: number; onProjectChange(project: ScreenshotProject): void; onScaleChange(scale: number): void; onCaptured?(route: string): void }) {
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
    if (project.previewConfig.sizeMode === "default") {
      setScale(1);
      onScaleChange(1);
      return;
    }
    const fit = () => {
      const availableWidth = stage.clientWidth;
      const availableHeight = Math.max(1, window.innerHeight - stage.getBoundingClientRect().top - 24);
      const next = Math.min(1, availableWidth / width, availableHeight / (height + 52));
      setScale(next);
      onScaleChange(next);
    };
    const observer = new ResizeObserver(fit);
    observer.observe(stage);
    window.addEventListener("resize", fit);
    fit();
    return () => { observer.disconnect(); window.removeEventListener("resize", fit); };
  }, [height, onScaleChange, project.previewConfig.sizeMode, width]);

  useEffect(() => {
    setDraftUrl(project.previewConfig.baseUrl);
    setCurrentUrl(project.previewConfig.baseUrl);
  }, [project.previewConfig.baseUrl]);
  useEffect(() => {
    if (!requestedRoute) return;
    const next = new URL(requestedRoute.route, `${project.previewConfig.baseUrl}/`).toString();
    setDraftUrl(next);
    setCurrentUrl(next);
  }, [project.previewConfig.baseUrl, requestedRoute?.key, requestedRoute?.route]);
  useEffect(() => {
    if (resetKey > 0 && ready) webviewRef.current?.reload();
  }, [ready, resetKey]);
  const navigate = (event: FormEvent) => {
    event.preventDefault();
    const next = normalizeLocalUrl(draftUrl);
    if (!next) { setError(copy.localOnly); return; }
    setError(null); setCurrentUrl(next);
  };
  const capture = async () => {
    const webview = webviewRef.current;
    if (!webview) return;
    setCapturing(true); setError(null);
    try {
      const detected = await webview.executeJavaScript<{ route?: string; name?: string; orientation?: "portrait" | "landscape"; theme?: "light" | "dark" }>(
        `(() => window.__GETGO_DESIGN_CAPTURE__?.() ?? ({ route: location.pathname + location.search + location.hash, name: document.title, orientation: innerWidth > innerHeight ? "landscape" : "portrait", theme: document.documentElement.classList.contains("dark") || document.documentElement.dataset.theme === "dark" || getComputedStyle(document.documentElement).colorScheme === "dark" ? "dark" : "light" }))()`,
      );
      const image = await webview.capturePage();
      const url = webview.getURL() || currentUrl;
      const route = detected.route || screenshotRoute(url);
      const pageTitle = detected.name?.trim() || webview.getTitle().trim() || route;
      const orientation = detected.orientation || (width > height ? "landscape" : "portrait");
      const theme = detected.theme === "dark" ? "dark" : "light";
      const next = await window.getgo.addScreenshot(project.id, image.toDataURL(), {
        name: pageTitle,
        route,
        orientation,
        theme,
        description: `${orientation} · ${theme} · ${width} × ${height} · ${new URL(url).origin}`,
      });
      onProjectChange(next);
      onCaptured?.(route);
      toast.show({ title: copy.captured, description: `${pageTitle} · ${orientation} · ${theme}` });
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setCapturing(false); }
  };

  return <div className="device-preview">
    {error && <ui.ErrorFrame message={error} />}
    <div className="device-preview-stage" ref={stageRef} style={{ height: Math.round((height + 52) * scale), "--device-preview-width": `${width}px` } as CSSProperties}>
      <div className="device-browser" style={{ width, height: height + 52, transform: `scale(${scale})` }}>
        <form className="device-browser-bar" onSubmit={navigate}>
          <ui.Button variant="icon" icon={<ArrowLeft />} aria-label={copy.back} disabled={!ready || !navigation.back} onClick={() => webviewRef.current?.goBack()} />
          <ui.Button variant="icon" icon={<ArrowRight />} aria-label={copy.forward} disabled={!ready || !navigation.forward} onClick={() => webviewRef.current?.goForward()} />
          <ui.Button variant="icon" icon={<RefreshCw />} aria-label={copy.reload} disabled={!ready} onClick={() => webviewRef.current?.reload()} />
          <ui.Input leftIcon={<Globe2 />} value={draftUrl} aria-label={copy.address} onChange={event => setDraftUrl(event.target.value)} />
          <ui.Button variant="primary" icon={<Camera />} loading={capturing} disabled={!ready || loading} aria-label={copy.capture} title={copy.capture} onClick={() => void capture()} />
        </form>
        <webview ref={element => { webviewRef.current = element as DeviceWebview | null; }} className="device-browser-webview" src={currentUrl} partition="persist:getgo-device-preview" />
      </div>
    </div>
  </div>;
}
