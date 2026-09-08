export type DesignViewport = "portrait" | "landscape";
export type DesignTheme = "light" | "dark";

export interface DesignReference { screenshotProjectId: string; screenshotIds: string[]; }
export interface DesignArtifact { viewport: DesignViewport; theme: DesignTheme; imageFile: string; htmlFile: string; }
export interface DesignAsset { id: string; name: string; fileName: string; description: string; }
export interface DesignPage { id: string; name: string; slug: string; request: string; createdAt: string; updatedAt: string; artifacts: DesignArtifact[]; assets: DesignAsset[]; specificationFile: string; legacyFile?: string; }
export interface DesignProject { schemaVersion: 1; id: string; name: string; description: string; instructions: string; createdAt: string; updatedAt: string; references: DesignReference[]; pages: DesignPage[]; }
export interface DesignProjectSummary { id: string; name: string; description: string; pageCount: number; updatedAt: string; }
export interface DesignProjectInput { name: string; description: string; instructions: string; references: DesignReference[]; }
export type DesignGenerationMode = "page" | "demo" | "reference";
export interface DesignGenerationInput { name: string; request: string; mode?: DesignGenerationMode; }
export interface DesignGenerationResult { project: DesignProject; page: DesignPage; usage: { inputTokens: number; outputTokens: number; cachedInputTokens: number; }; }

export interface DesignProjectsDesktopApi {
  listDesignProjects(): Promise<DesignProjectSummary[]>;
  createDesignProject(input: DesignProjectInput): Promise<DesignProject>;
  updateDesignProject(id: string, input: DesignProjectInput): Promise<DesignProject>;
  loadDesignProject(id: string): Promise<DesignProject>;
  generateDesignPage(id: string, input: DesignGenerationInput): Promise<DesignGenerationResult>;
  deleteDesignPage(id: string, pageId: string): Promise<DesignProject>;
  showDesignProjectFolder(id: string): Promise<void>;
  getDesignPreviewUrl(id: string, pageId: string, viewport: DesignViewport, theme: DesignTheme): Promise<string>;
  getDesignReferenceUrl(id: string, pageId: string, viewport: DesignViewport, theme: DesignTheme): Promise<string>;
}
