import { clipboard, nativeImage, shell } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  ScreenshotMetadataInput,
  ScreenshotProject,
  ScreenshotProjectInput,
  ScreenshotProjectSummary,
  DesignOrientation,
  DesignTheme,
  PageBreakdownInput,
} from "../domain/screenshot-project.js";

const safeId = (value: string) => {
  if (!/^[a-z0-9-]+$/.test(value))
    throw new Error("Invalid screenshot project identifier.");
  return value;
};

const safeFileName = (value: string) => {
  if (!/^[a-f0-9-]+\.png$/.test(value))
    throw new Error("Invalid screenshot file name.");
  return value;
};

const cleanText = (value: unknown, label: string, required = false) => {
  if (typeof value !== "string") throw new Error(`Invalid ${label}.`);
  const cleaned = value.trim();
  if (required && !cleaned) throw new Error(`${label} is required.`);
  if (cleaned.length > 500) throw new Error(`${label} is too long.`);
  return cleaned;
};

const normalizeRoute = (value: unknown) => {
  const route = cleanText(value, "route") || "/";
  return route.startsWith("/") ? route : `/${route}`;
};

const normalizePreviewConfig = (value: ScreenshotProjectInput["previewConfig"] | undefined) => {
  const baseUrlValue = value?.baseUrl ?? "http://localhost:5173";
  const baseUrl = new URL(baseUrlValue);
  if (!["http:", "https:"].includes(baseUrl.protocol) || !["localhost", "127.0.0.1", "::1"].includes(baseUrl.hostname))
    throw new Error("Preview URL must use localhost, 127.0.0.1, or ::1.");
  const width = Number(value?.width ?? 393);
  const height = Number(value?.height ?? 852);
  if (!Number.isInteger(width) || width < 240 || width > 2560 || !Number.isInteger(height) || height < 320 || height > 2560)
    throw new Error("Preview dimensions are invalid.");
  const sizeMode: "fit" | "default" = value?.sizeMode === "default" ? "default" : "fit";
  return { baseUrl: baseUrl.toString().replace(/\/$/, ""), devicePreset: cleanText(value?.devicePreset ?? "iphone-15", "device preset", true), width, height, sizeMode };
};

export class ScreenshotProjectService {
  private readonly root: string;

  constructor(screenshotProjectsRoot: string) {
    this.root = path.resolve(screenshotProjectsRoot);
  }

  private projectFolder(projectId: string) {
    return path.join(this.root, safeId(projectId));
  }

  private manifestPath(projectId: string) {
    return path.join(this.projectFolder(projectId), "project.json");
  }

  private async write(project: ScreenshotProject) {
    const file = this.manifestPath(project.id);
    const temporary = `${file}.tmp`;
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(
      temporary,
      `${JSON.stringify(project, null, 2)}\n`,
      "utf8",
    );
    await fs.rename(temporary, file);
  }

  private async read(projectId: string): Promise<ScreenshotProject> {
    const data = JSON.parse(
      await fs.readFile(this.manifestPath(projectId), "utf8"),
    ) as ScreenshotProject;
    if (
      data.schemaVersion !== 1 ||
      data.id !== projectId ||
      !Array.isArray(data.screenshots)
    )
      throw new Error("The screenshot project is invalid.");
    return {
      ...data,
      instructions: typeof data.instructions === "string" ? data.instructions : "",
      previewConfig: normalizePreviewConfig(data.previewConfig),
      screenshots: data.screenshots.map(item => ({
        ...item,
        orientation: item.orientation === "landscape" ? "landscape" : item.width > item.height ? "landscape" : "portrait",
        theme: item.theme === "dark" ? "dark" : "light",
      })),
      pageBreakdowns: (data as ScreenshotProject & { pageBreakdowns?: Record<string, unknown> }).pageBreakdowns ?? {},
    } as ScreenshotProject;
  }

  async list(): Promise<ScreenshotProjectSummary[]> {
    await fs.mkdir(this.root, { recursive: true });
    const entries = await fs.readdir(this.root, { withFileTypes: true });
    const projects = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          try {
            const project = await this.read(entry.name);
            return {
              id: project.id,
              name: project.name,
              description: project.description,
              screenshotCount: project.screenshots.length,
              pageCount: new Set(project.screenshots.map(item => item.route)).size,
              createdAt: project.createdAt,
              updatedAt: project.updatedAt,
            };
          } catch {
            return null;
          }
        }),
    );
    return projects
      .filter((item): item is ScreenshotProjectSummary => Boolean(item))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async create(input: ScreenshotProjectInput): Promise<ScreenshotProject> {
    const now = new Date().toISOString();
    const project: ScreenshotProject = {
      schemaVersion: 1,
      id: randomUUID(),
      name: cleanText(input?.name, "project name", true),
      description: cleanText(input?.description ?? "", "description"),
      instructions: cleanText(input?.instructions ?? "", "instructions"),
      createdAt: now,
      updatedAt: now,
      previewConfig: normalizePreviewConfig(input?.previewConfig),
      screenshots: [],
      pageBreakdowns: {},
    };
    await fs.mkdir(path.join(this.projectFolder(project.id), "screenshots"), {
      recursive: true,
    });
    await this.write(project);
    return project;
  }


  async updateProject(projectId: string, input: ScreenshotProjectInput): Promise<ScreenshotProject> {
    const project = await this.read(safeId(projectId));
    project.name = cleanText(input?.name, "project name", true);
    project.description = cleanText(input?.description ?? "", "description");
    project.instructions = cleanText(input?.instructions ?? "", "instructions");
    project.previewConfig = normalizePreviewConfig(input?.previewConfig);
    project.updatedAt = new Date().toISOString();
    await this.write(project);
    return this.load(project.id);
  }

  async load(projectId: string): Promise<ScreenshotProject> {
    const project = await this.read(safeId(projectId));
    const screenshots = await Promise.all(
      project.screenshots.map(async (screenshot) => {
        try {
          const bytes = await fs.readFile(
            path.join(
              this.projectFolder(project.id),
              "screenshots",
              safeFileName(screenshot.fileName),
            ),
          );
          return {
            ...screenshot,
            previewDataUrl: `data:${screenshot.mimeType};base64,${bytes.toString("base64")}`,
          };
        } catch {
          return screenshot;
        }
      }),
    );
    return { ...project, screenshots };
  }

  async add(
    projectId: string,
    imageDataUrl: string,
    metadata: ScreenshotMetadataInput,
  ): Promise<ScreenshotProject> {
    if (typeof imageDataUrl !== "string" || !imageDataUrl.startsWith("data:image/png;base64,"))
      throw new Error("Invalid screenshot image data.");
    const image = nativeImage.createFromDataURL(imageDataUrl);
    if (image.isEmpty())
      throw new Error("The screenshot image could not be decoded.");
    const project = await this.read(safeId(projectId));
    const id = randomUUID();
    const now = new Date().toISOString();
    const size = image.getSize();
    const fileName = `${id}.png`;
    const orientation: DesignOrientation = metadata.orientation === "landscape" ? "landscape" : "portrait";
    const theme: DesignTheme = metadata.theme === "dark" ? "dark" : "light";
    const route = normalizeRoute(metadata?.route);
    const existing = project.screenshots.find(item => item.route === route && item.orientation === orientation && item.theme === theme);
    await fs.writeFile(
      path.join(this.projectFolder(project.id), "screenshots", fileName),
      image.toPNG(),
    );
    if (existing) await shell.trashItem(path.join(this.projectFolder(project.id), "screenshots", safeFileName(existing.fileName)));
    const record = {
      id: existing?.id ?? id,
      name: cleanText(metadata?.name, "screenshot name", true),
      description: cleanText(metadata?.description ?? "", "description"),
      route,
      fileName,
      mimeType: "image/png" as const,
      width: size.width,
      height: size.height,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      orientation,
      theme,
    };
    if (existing) project.screenshots.splice(project.screenshots.indexOf(existing), 1, record);
    else project.screenshots.push(record);
    project.updatedAt = now;
    await this.write(project);
    return this.load(project.id);
  }

  async update(
    projectId: string,
    screenshotId: string,
    metadata: ScreenshotMetadataInput,
  ): Promise<ScreenshotProject> {
    const project = await this.read(safeId(projectId));
    const screenshot = project.screenshots.find(
      (item) => item.id === screenshotId,
    );
    if (!screenshot) throw new Error("Screenshot not found.");
    screenshot.name = cleanText(metadata?.name, "screenshot name", true);
    screenshot.description = cleanText(
      metadata?.description ?? "",
      "description",
    );
    screenshot.route = normalizeRoute(metadata?.route);
    screenshot.orientation = metadata.orientation === "landscape" ? "landscape" : screenshot.orientation;
    screenshot.theme = metadata.theme === "dark" ? "dark" : metadata.theme === "light" ? "light" : screenshot.theme;
    screenshot.updatedAt = new Date().toISOString();
    project.updatedAt = screenshot.updatedAt;
    await this.write(project);
    return this.load(project.id);
  }

  async delete(projectId: string, screenshotId: string): Promise<ScreenshotProject> {
    const project = await this.read(safeId(projectId));
    const index = project.screenshots.findIndex((item) => item.id === screenshotId);
    if (index < 0) throw new Error("Screenshot not found.");
    const [screenshot] = project.screenshots.splice(index, 1);
    const imagePath = path.join(this.projectFolder(project.id), "screenshots", safeFileName(screenshot.fileName));
    await shell.trashItem(imagePath);
    project.updatedAt = new Date().toISOString();
    await this.write(project);
    return this.load(project.id);
  }

  async clear(projectId: string): Promise<ScreenshotProject> {
    const project = await this.read(safeId(projectId));
    for (const screenshot of project.screenshots) {
      const imagePath = path.join(this.projectFolder(project.id), "screenshots", safeFileName(screenshot.fileName));
      await shell.trashItem(imagePath);
    }
    project.screenshots = [];
    project.updatedAt = new Date().toISOString();
    await this.write(project);
    return this.load(project.id);
  }

  async updatePageBreakdown(projectId: string, input: PageBreakdownInput): Promise<ScreenshotProject> {
    const project = await this.read(safeId(projectId)) as ScreenshotProject & { pageBreakdowns?: Record<string, unknown> };
    const route = normalizeRoute(input.route);
    const orientation: DesignOrientation = input.orientation === "landscape" ? "landscape" : "portrait";
    project.pageBreakdowns ??= {};
    project.pageBreakdowns[`${route}:${orientation}`] = {
      orientation,
      summary: cleanText(input.summary ?? "", "breakdown summary"),
      definition: input.definition && typeof input.definition === "object" ? input.definition : null,
      updatedAt: new Date().toISOString(),
    };
    project.updatedAt = new Date().toISOString();
    await this.write(project);
    return this.load(project.id);
  }

  inspectClipboard() {
    const image = clipboard.readImage();
    if (image.isEmpty()) return null;
    const size = image.getSize();
    return { previewDataUrl: image.toDataURL(), width: size.width, height: size.height };
  }

  folder(projectId: string) {
    return this.projectFolder(safeId(projectId));
  }
}
