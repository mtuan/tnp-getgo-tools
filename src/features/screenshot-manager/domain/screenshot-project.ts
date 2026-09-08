export interface ScreenshotRecord {
  id: string;
  name: string;
  description: string;
  route: string;
  fileName: string;
  mimeType: "image/png";
  width: number;
  height: number;
  createdAt: string;
  updatedAt: string;
  previewDataUrl?: string;
  orientation: DesignOrientation;
  theme: DesignTheme;
}

export type DesignOrientation = "portrait" | "landscape";
export type DesignTheme = "light" | "dark";
export type DesignVariant = `${DesignOrientation}-${DesignTheme}`;

export interface PageBreakdown {
  orientation: DesignOrientation;
  summary: string;
  definition: Record<string, unknown> | null;
  updatedAt: string;
}

export interface DesignPageRecord {
  id: string;
  name: string;
  route: string;
  screenshots: Partial<Record<DesignVariant, ScreenshotRecord>>;
  breakdowns: Partial<Record<DesignOrientation, PageBreakdown>>;
}

export interface ScreenshotProject {
  schemaVersion: 1;
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  previewConfig: ScreenshotPreviewConfig;
  instructions: string;
  screenshots: ScreenshotRecord[];
  pageBreakdowns: Record<string, PageBreakdown>;
}

export interface ScreenshotPreviewConfig {
  baseUrl: string;
  devicePreset: string;
  width: number;
  height: number;
  sizeMode: "fit" | "default";
}

export interface ScreenshotProjectSummary {
  id: string;
  name: string;
  description: string;
  screenshotCount: number;
  pageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ScreenshotProjectInput {
  name: string;
  description: string;
  instructions: string;
  previewConfig: ScreenshotPreviewConfig;
}

export interface ScreenshotMetadataInput {
  name: string;
  description: string;
  route: string;
  orientation?: DesignOrientation;
  theme?: DesignTheme;
}

export interface PageBreakdownInput {
  route: string;
  orientation: DesignOrientation;
  summary: string;
  definition: Record<string, unknown> | null;
}

export interface ClipboardScreenshot {
  previewDataUrl: string;
  width: number;
  height: number;
}

export interface ScreenshotManagerDesktopApi {
  listScreenshotProjects(): Promise<ScreenshotProjectSummary[]>;
  createScreenshotProject(
    input: ScreenshotProjectInput,
  ): Promise<ScreenshotProject>;
  updateScreenshotProject(
    projectId: string,
    input: ScreenshotProjectInput,
  ): Promise<ScreenshotProject>;
  loadScreenshotProject(projectId: string): Promise<ScreenshotProject>;
  inspectClipboardScreenshot(): Promise<ClipboardScreenshot | null>;
  addScreenshot(
    projectId: string,
    imageDataUrl: string,
    metadata: ScreenshotMetadataInput,
  ): Promise<ScreenshotProject>;
  updateScreenshot(
    projectId: string,
    screenshotId: string,
    metadata: ScreenshotMetadataInput,
  ): Promise<ScreenshotProject>;
  deleteScreenshot(
    projectId: string,
    screenshotId: string,
  ): Promise<ScreenshotProject>;
  clearScreenshots(projectId: string): Promise<ScreenshotProject>;
  updatePageBreakdown(projectId: string, input: PageBreakdownInput): Promise<ScreenshotProject>;
  clearPreviewBrowserData(): Promise<void>;
  showScreenshotProjectFolder(projectId: string): Promise<void>;
}
