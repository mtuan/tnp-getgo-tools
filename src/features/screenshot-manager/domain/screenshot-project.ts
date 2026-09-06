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
}

export interface ScreenshotProject {
  schemaVersion: 1;
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  screenshots: ScreenshotRecord[];
}

export interface ScreenshotProjectSummary {
  id: string;
  name: string;
  description: string;
  screenshotCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ScreenshotProjectInput {
  name: string;
  description: string;
}

export interface ScreenshotMetadataInput {
  name: string;
  description: string;
  route: string;
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
  showScreenshotProjectFolder(projectId: string): Promise<void>;
}
