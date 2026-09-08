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
  snapshotFileName?: string;
  domSnapshot?: CapturedDomSnapshot;
}

export interface CapturedDomElement {
  id: string;
  parentId: string | null;
  tag: string;
  role: string | null;
  name: string | null;
  text: string | null;
  selector: string;
  bounds: { x: number; y: number; width: number; height: number };
  normalizedBounds: { x: number; y: number; width: number; height: number };
  positioning: Record<string, string>;
  box: Record<string, string>;
  typography: Record<string, string>;
  paint: Record<string, string>;
  image: { src: string; naturalWidth: number; naturalHeight: number } | null;
  attributes: Record<string, string>;
  childIds: string[];
  semantic?: {
    id: string;
    label: string;
    kind: string;
    meaning: string | null;
    confidence: "explicit" | "derived" | "unclassified";
  };
}

export interface CapturedDomSnapshot {
  schemaVersion: 1;
  capturedAt: string;
  url: string;
  title: string;
  viewport: { width: number; height: number; devicePixelRatio: number; scrollX: number; scrollY: number };
  rootIds: string[];
  elements: CapturedDomElement[];
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

export interface ScreenshotPageAnalysis {
  route: string;
  name: string;
  sourceVariants: DesignVariant[];
  definition: Record<string, unknown>;
}

export interface ScreenshotProjectAnalysis {
  generalRulesFile: string;
  structureLibraryFile: string;
  pagesFile: string;
  updatedAt: string;
}

export interface ScreenshotAnalysisDocuments {
  generalRulesMarkdown: string;
  structureLibrary: Record<string, unknown>;
  pages: ScreenshotPageAnalysis[];
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
  pages: Array<{ route: string; name: string }>;
  screenshots: ScreenshotRecord[];
  pageBreakdowns: Record<string, PageBreakdown>;
  analysis?: ScreenshotProjectAnalysis;
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
    domSnapshot?: CapturedDomSnapshot,
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
  deleteScreenshotPage(projectId: string, route: string): Promise<ScreenshotProject>;
  clearScreenshotPage(projectId: string, route: string): Promise<ScreenshotProject>;
  clearScreenshots(projectId: string): Promise<ScreenshotProject>;
  clearScreenshotProjectData(projectId: string): Promise<ScreenshotProject>;
  updatePageBreakdown(projectId: string, input: PageBreakdownInput): Promise<ScreenshotProject>;
  loadScreenshotProjectAnalysis(projectId: string): Promise<ScreenshotAnalysisDocuments | null>;
  clearPreviewBrowserData(): Promise<void>;
  showScreenshotProjectFolder(projectId: string): Promise<void>;
}
