import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Camera, Globe2, Monitor, RefreshCw, RotateCw, Smartphone, Tablet } from "lucide-react";
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
}

const devices = [
  { id: "iphone-se", label: "iPhone SE", width: 375, height: 667, icon: Smartphone },
  { id: "iphone-15", label: "iPhone 15", width: 393, height: 852, icon: Smartphone },
  { id: "iphone-15-max", label: "iPhone 15 Pro Max", width: 430, height: 932, icon: Smartphone },
  { id: "ipad-mini", label: "iPad mini", width: 768, height: 1024, icon: Tablet },
  { id: "ipad-pro", label: "iPad Pro 12.9\"", width: 1024, height: 1366, icon: Tablet },
  { id: "desktop", label: "Desktop", width: 1280, height: 800, icon: Monitor },
  { id: "custom", label: "Custom", width: 390, height: 844, icon: Monitor },
] as const;

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

export function DevicePreview({ locale, project, onProjectChange }: { locale: "en" | "vi"; project: ScreenshotProject; onProjectChange(project: ScreenshotProject): void }) {
  const copy = (locale === "vi" ? vi : en).screenshotManager.devicePreview;
  const [deviceId, setDeviceId] = useState("iphone-15");
  const selected = devices.find(device => device.id === deviceId) ?? devices[1];
  const [width, setWidth] = useState<number>(selected.width);
  const [height, setHeight] = useState<number>(selected.height);
  const [draftUrl, setDraftUrl] = useState("http://localhost:5173/");
  const [currentUrl, setCurrentUrl] = useState(draftUrl);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
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
    setTitle(webview.getTitle());
    setNavigation({ back: webview.canGoBack(), forward: webview.canGoForward() });
  };
  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;
    const started = () => setLoading(true);
    const stopped = () => { setLoading(false); updateNavigation(); };
    const failed = () => setLoading(false);
    webview.addEventListener("did-start-loading", started);
    webview.addEventListener("did-stop-loading", stopped);
    webview.addEventListener("did-navigate", updateNavigation);
    webview.addEventListener("did-navigate-in-page", updateNavigation);
    webview.addEventListener("page-title-updated", updateNavigation);
    webview.addEventListener("did-fail-load", failed);
    return () => {
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
    const resize = () => setScale(Math.min(1, Math.max(.25, (stage.clientWidth - 48) / width)));
    const observer = new ResizeObserver(resize);
    observer.observe(stage); resize();
    return () => observer.disconnect();
  }, [width]);

  const options = useMemo(() => devices.map(device => ({ value: device.id, label: `${device.label} · ${device.width} × ${device.height}` })), []);
  const chooseDevice = (id: string) => {
    const device = devices.find(item => item.id === id);
    if (!device) return;
    setDeviceId(id); setWidth(device.width); setHeight(device.height);
  };
  const navigate = (event: FormEvent) => {
    event.preventDefault();
    const next = normalizeLocalUrl(draftUrl);
    if (!next) { setError(copy.localOnly); return; }
    setError(null); setCurrentUrl(next);
    void webviewRef.current?.loadURL(next);
  };
  const capture = async () => {
    const webview = webviewRef.current;
    if (!webview) return;
    setCapturing(true); setError(null);
    try {
      const image = await webview.capturePage();
      const url = webview.getURL() || currentUrl;
      const route = screenshotRoute(url);
      const pageTitle = webview.getTitle().trim() || route;
      const next = await window.getgo.addScreenshot(project.id, image.toDataURL(), {
        name: pageTitle,
        route,
        description: `${selected.label} · ${width} × ${height} · ${new URL(url).origin}`,
      });
      onProjectChange(next);
      toast.show({ title: copy.captured, description: `${pageTitle} · ${route}` });
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setCapturing(false); }
  };

  return <div className="device-preview">
    <div className="device-preview-controls">
      <ui.Select value={deviceId} options={options} onValueChange={chooseDevice} ariaLabel={copy.device} />
      <label><span>{copy.width}</span><ui.Input type="number" min={240} max={2560} value={width} onChange={event => { setDeviceId("custom"); setWidth(Number(event.target.value)); }} /></label>
      <span className="device-preview-times">×</span>
      <label><span>{copy.height}</span><ui.Input type="number" min={320} max={2560} value={height} onChange={event => { setDeviceId("custom"); setHeight(Number(event.target.value)); }} /></label>
      <ui.Button variant="icon" icon={<RotateCw />} aria-label={copy.rotate} title={copy.rotate} onClick={() => { setWidth(height); setHeight(width); }} />
      <span className="device-preview-scale">{Math.round(scale * 100)}%</span>
    </div>
    {error && <ui.ErrorFrame message={error} />}
    <div className="device-preview-stage" ref={stageRef} style={{ minHeight: Math.round((height + 52) * scale) + 48 }}>
      <div className="device-browser" style={{ width, height: height + 52, transform: `scale(${scale})` }}>
        <form className="device-browser-bar" onSubmit={navigate}>
          <ui.Button variant="icon" icon={<ArrowLeft />} aria-label={copy.back} disabled={!navigation.back} onClick={() => webviewRef.current?.goBack()} />
          <ui.Button variant="icon" icon={<ArrowRight />} aria-label={copy.forward} disabled={!navigation.forward} onClick={() => webviewRef.current?.goForward()} />
          <ui.Button variant="icon" icon={<RefreshCw />} aria-label={copy.reload} onClick={() => webviewRef.current?.reload()} />
          <ui.Input leftIcon={<Globe2 />} value={draftUrl} aria-label={copy.address} onChange={event => setDraftUrl(event.target.value)} />
          <ui.Button variant="primary" icon={<Camera />} loading={capturing} disabled={loading} aria-label={copy.capture} title={copy.capture} onClick={() => void capture()} />
        </form>
        <webview ref={element => { webviewRef.current = element as DeviceWebview | null; }} className="device-browser-webview" src={currentUrl} partition="persist:getgo-device-preview" />
      </div>
    </div>
    <div className="device-preview-status"><strong>{title || copy.untitled}</strong><code>{currentUrl}</code></div>
  </div>;
}
