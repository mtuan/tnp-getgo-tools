import { useMemo, useState } from "react";
import { Image as ImageIcon, RectangleHorizontal, RectangleVertical } from "lucide-react";
import * as ui from "../../../shared/ui";
import type { DesignOrientation, DesignVariant, ScreenshotProject } from "../domain/screenshot-project";
import { DevicePreview } from "./DevicePreview";

const sizes = {
  portrait: { devicePreset: "iphone-15", width: 393, height: 852 },
  landscape: { devicePreset: "desktop", width: 1440, height: 900 },
} as const;
const variants: DesignVariant[] = ["portrait-light", "portrait-dark", "landscape-light", "landscape-dark"];

export function RouteScreenshotPage({ locale, project, pageRoute, resetKey, onProjectChange, showReferences = true }: {
  locale: "en" | "vi";
  project: ScreenshotProject;
  pageRoute: string;
  resetKey: number;
  onProjectChange(project: ScreenshotProject): void;
  showReferences?: boolean;
}) {
  const vi = locale === "vi";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const screenshots = useMemo(() => project.screenshots.filter(item => item.route === pageRoute), [pageRoute, project.screenshots]);
  const pageName = screenshots[0]?.name || pageRoute;
  const orientation: DesignOrientation = project.previewConfig.width > project.previewConfig.height ? "landscape" : "portrait";
  const changeOrientation = async (next: DesignOrientation) => {
    if (next === orientation || busy) return;
    setBusy(true); setError(null);
    try {
      const nextProject = await window.getgo.updateScreenshotProject(project.id, {
        name: project.name,
        description: project.description,
        instructions: project.instructions,
        previewConfig: { ...project.previewConfig, ...sizes[next], sizeMode: "fit" },
      });
      onProjectChange(nextProject);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };

  return <div className="route-screenshot-page">
    {error && <ui.ErrorFrame message={error} />}
    {showReferences && <ui.Panel title={vi ? "Ảnh tham chiếu" : "Reference screenshots"} description={vi ? "Mỗi chế độ có một ảnh chuẩn; chụp lại sẽ thay thế ảnh hiện tại." : "Each mode has one canonical image; capturing again replaces it."}>
      <ui.PanelBody className="route-screenshot-slots">
        {variants.map(variant => {
          const [slotOrientation, theme] = variant.split("-");
          const screenshot = screenshots.find(item => item.orientation === slotOrientation && item.theme === theme);
          return <figure className="route-screenshot-slot" key={variant}>
            <div>{screenshot ? <ui.Image src={screenshot.previewDataUrl} alt={`${pageName} ${variant}`} fit="contain" /> : <span><ImageIcon />{vi ? "Chưa chụp" : "Not captured"}</span>}</div>
            <figcaption>{slotOrientation === "portrait" ? (vi ? "Dọc" : "Portrait") : (vi ? "Ngang" : "Landscape")} · {theme === "dark" ? (vi ? "Tối" : "Dark") : (vi ? "Sáng" : "Light")}</figcaption>
          </figure>;
        })}
      </ui.PanelBody>
    </ui.Panel>}
    <ui.Panel className={showReferences ? "" : "route-capture-browser-panel"} title={vi ? "Trình duyệt chụp màn hình" : "Capture browser"} description={pageRoute} meta={<ui.ControlGroup>
      <ui.Button icon={<RectangleVertical />} variant={orientation === "portrait" ? "primary" : "secondary"} disabled={busy} onClick={() => void changeOrientation("portrait")}>{vi ? "Dọc" : "Portrait"}</ui.Button>
      <ui.Button icon={<RectangleHorizontal />} variant={orientation === "landscape" ? "primary" : "secondary"} disabled={busy} onClick={() => void changeOrientation("landscape")}>{vi ? "Ngang" : "Landscape"}</ui.Button>
    </ui.ControlGroup>}>
      <DevicePreview locale={locale} project={project} requestedRoute={{ route: pageRoute, key: 1 }} resetKey={resetKey} onScaleChange={() => undefined} onProjectChange={onProjectChange} />
    </ui.Panel>
  </div>;
}
