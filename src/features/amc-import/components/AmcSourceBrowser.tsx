import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, Globe2, RefreshCw } from "lucide-react";
import * as ui from "../../../shared/ui";
import { amcIndexUrl } from "../domain/amc-import";

interface SourceWebview extends HTMLElement {
  canGoBack(): boolean;
  canGoForward(): boolean;
  executeJavaScript<T>(code: string): Promise<T>;
  getURL(): string;
  goBack(): void;
  goForward(): void;
  loadURL(url: string): Promise<void>;
  reload(): void;
}

export function AmcSourceBrowser({ locale, paperUrl, onSessionChange }: { locale: "en" | "vi"; paperUrl: string; onSessionChange(ready: boolean): void }) {
  const vi = locale === "vi";
  const webviewRef = useRef<SourceWebview | null>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState(amcIndexUrl);
  const [navigation, setNavigation] = useState({ back: false, forward: false });
  const [session, setSession] = useState<"unknown" | "verified" | "challenge">("unknown");

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;
    const sync = () => {
      setUrl(webview.getURL() || amcIndexUrl);
      setNavigation({ back: webview.canGoBack(), forward: webview.canGoForward() });
    };
    const started = () => { setLoading(true); setSession("unknown"); onSessionChange(false); };
    const stopped = () => { setLoading(false); setReady(true); sync(); };
    webview.addEventListener("did-start-loading", started);
    webview.addEventListener("did-stop-loading", stopped);
    webview.addEventListener("did-navigate", sync);
    webview.addEventListener("did-navigate-in-page", sync);
    return () => {
      webview.removeEventListener("did-start-loading", started);
      webview.removeEventListener("did-stop-loading", stopped);
      webview.removeEventListener("did-navigate", sync);
      webview.removeEventListener("did-navigate-in-page", sync);
    };
  }, [onSessionChange]);

  const navigate = (target: string) => {
    setSession("unknown");
    onSessionChange(false);
    void webviewRef.current?.loadURL(target);
  };
  const testSession = async () => {
    const verified = await webviewRef.current?.executeJavaScript<boolean>(
      `Boolean(document.querySelector('#mw-content-text, .mw-parser-output')) && !document.title.includes('Just a moment')`,
    ).catch(() => false);
    setSession(verified ? "verified" : "challenge");
    onSessionChange(Boolean(verified));
  };

  return <ui.Panel
    title={vi ? "Trình duyệt nguồn AoPS" : "AoPS source browser"}
    description={vi ? "Hoàn tất xác minh Cloudflare tại đây, sau đó kiểm tra phiên trước khi trích xuất." : "Complete Cloudflare verification here, then test the session before extracting."}
    meta={<span className={`amc-browser-session amc-browser-session-${session}`}><CheckCircle2 size={14} />{session === "verified" ? (vi ? "Phiên sẵn sàng" : "Session ready") : session === "challenge" ? (vi ? "Cần xác minh" : "Verification required") : (vi ? "Chưa kiểm tra" : "Not tested")}</span>}
  >
    <div className="amc-browser-toolbar">
      <ui.Button variant="icon" icon={<ArrowLeft />} aria-label={vi ? "Quay lại" : "Back"} disabled={!ready || !navigation.back} onClick={() => webviewRef.current?.goBack()} />
      <ui.Button variant="icon" icon={<ArrowRight />} aria-label={vi ? "Tiến tới" : "Forward"} disabled={!ready || !navigation.forward} onClick={() => webviewRef.current?.goForward()} />
      <ui.Button variant="icon" icon={<RefreshCw />} aria-label={vi ? "Tải lại" : "Reload"} disabled={!ready} onClick={() => webviewRef.current?.reload()} />
      <div className="amc-browser-address"><Globe2 size={15} /><span>{url}</span></div>
      <ui.Button variant="secondary" disabled={loading} onClick={() => navigate(amcIndexUrl)}>{vi ? "Danh mục" : "Archive"}</ui.Button>
      <ui.Button variant="secondary" disabled={loading} onClick={() => navigate(paperUrl)}>{vi ? "Đề đã chọn" : "Selected paper"}</ui.Button>
      <ui.Button variant="primary" loading={loading} disabled={!ready} onClick={() => void testSession()}>{vi ? "Kiểm tra phiên" : "Test session"}</ui.Button>
    </div>
    <div className="amc-browser-frame">
      <webview ref={(element) => { webviewRef.current = element as SourceWebview | null; }} src={amcIndexUrl} partition="persist:getgo-aops-import" />
    </div>
  </ui.Panel>;
}
