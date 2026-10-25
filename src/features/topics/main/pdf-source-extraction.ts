import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { nativeImage } from "electron";
import type { QuizSourceExtractImage, QuizSourceExtraction } from "../../../shared/domain/pdf-source-extraction.js";
import { imageAssetPath, imageAssetReference } from "../../../shared/domain/image-asset-reference.js";
import { contentTopicsRoot } from "../repository/content-source.js";
import { resolveContentV2QuizSourcePdf } from "../repository/content-v2-repository.js";

const execFileAsync = promisify(execFile);
const extractionTasks = new Map<string, Promise<QuizSourceExtraction>>();
const imageMimeTypes: Record<string, string> = {
  ".gif": "image/gif",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

type ExtractDocument = {
  schemaVersion: number;
  source?: { filename?: string; sha256?: string };
  summary?: { pages?: number; text?: number; image?: number; drawing?: number };
  pages?: Array<{ elements?: Array<Record<string, unknown>> }>;
};

const validId = (value: string, label: string) => {
  if (!/^[a-z][a-z0-9_-]*$/.test(value)) throw new Error(`Invalid ${label}.`);
  return value;
};

export async function resolveQuizSourcePdfPath(root: string, manifestPathValue: unknown): Promise<string> {
  if (typeof manifestPathValue !== "string" || !path.isAbsolute(manifestPathValue) || !["manifest.json", "quiz.json"].includes(path.basename(manifestPathValue)))
    throw new Error("Invalid quiz path.");
  const repositoryRelative = path.relative(root, manifestPathValue);
  if (repositoryRelative.startsWith("..") || path.isAbsolute(repositoryRelative))
    throw new Error("Quiz is outside the selected repository.");
  if (path.basename(manifestPathValue) === "manifest.json") {
    const sourcePdf = path.join(path.dirname(manifestPathValue), "source.pdf");
    await fs.access(sourcePdf).catch(() => { throw new Error("This quiz does not have a source PDF."); });
    return sourcePdf;
  }
  const relative = path.relative(contentTopicsRoot(root), manifestPathValue);
  const parts = relative.split(path.sep);
  if (relative.startsWith("..") || path.isAbsolute(relative) || parts.length !== 4 || parts[1] !== "quizzes" || parts[3] !== "quiz.json")
    throw new Error("Quiz is outside the selected repository.");
  const sourcePdf = await resolveContentV2QuizSourcePdf(root, validId(parts[0], "topic ID"), validId(parts[2], "quiz ID"));
  if (!sourcePdf) throw new Error("This quiz does not have a source PDF.");
  return sourcePdf;
}

function safeChild(root: string, relativePath: string, label: string): string {
  if (!relativePath || path.isAbsolute(relativePath) || relativePath.split(/[\\/]/).includes(".."))
    throw new Error(`Invalid ${label}.`);
  const resolved = path.resolve(root, relativePath);
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative))
    throw new Error(`Invalid ${label}.`);
  return resolved;
}

async function fileSha256(filePath: string): Promise<string> {
  return createHash("sha256").update(await fs.readFile(filePath)).digest("hex");
}

async function loadExtraction(sourcePdf: string, extractDirectory: string): Promise<QuizSourceExtraction> {
  const documentPath = path.join(extractDirectory, "document.json");
  const document = JSON.parse(await fs.readFile(documentPath, "utf8")) as ExtractDocument;
  if (document.schemaVersion !== 1 || !Array.isArray(document.pages))
    throw new Error("The saved PDF extraction is invalid.");
  const images: QuizSourceExtractImage[] = [];
  for (const page of document.pages) {
    for (const element of page.elements ?? []) {
      if (element.type !== "image" || typeof element.id !== "string" || typeof element.asset !== "string" || typeof element.page !== "number") continue;
      const assetPath = safeChild(extractDirectory, element.asset, "extracted image path");
      await fs.access(assetPath);
      images.push({
        id: element.id,
        page: element.page,
        asset: element.asset,
        ...(typeof element.width === "number" ? { width: element.width } : {}),
        ...(typeof element.height === "number" ? { height: element.height } : {}),
        ...(typeof element.sha256 === "string" ? { sha256: element.sha256 } : {}),
      });
    }
  }
  return {
    sourceSha256: document.source?.sha256 ?? await fileSha256(sourcePdf),
    summary: {
      pages: document.summary?.pages ?? document.pages.length,
      text: document.summary?.text ?? 0,
      images: document.summary?.image ?? images.length,
    },
    images,
  };
}

async function findPython(): Promise<string> {
  const candidates = process.platform === "win32"
    ? ["python", "py", "python3"]
    : ["python3", "/opt/homebrew/Caskroom/miniconda/base/bin/python3", "python"];
  for (const candidate of candidates) {
    try {
      await execFileAsync(candidate, ["-c", "import fitz"], { timeout: 10_000 });
      return candidate;
    } catch { /* Try the next configured Python binary. */ }
  }
  throw new Error("PDF extraction requires Python with PyMuPDF installed.");
}

async function createExtraction(root: string, sourcePdf: string, extractDirectory: string): Promise<void> {
  const scriptPath = path.join(root, "tools", "pdf-source-extractor", "extract.py");
  await fs.access(scriptPath).catch(() => { throw new Error("The PDF source extractor is not available in this quiz repository."); });
  const temporaryDirectory = path.join(path.dirname(sourcePdf), `.source-extract-${process.pid}-${Date.now()}`);
  try {
    const python = await findPython();
    await execFileAsync(python, [scriptPath, sourcePdf, temporaryDirectory], {
      maxBuffer: 20 * 1024 * 1024,
      timeout: 5 * 60_000,
    });
    await fs.rename(temporaryDirectory, extractDirectory);
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
}

export function ensureQuizSourceExtraction(root: string, manifestPath: unknown): Promise<QuizSourceExtraction> {
  const key = String(manifestPath);
  const existing = extractionTasks.get(key);
  if (existing) return existing;
  const task = (async () => {
    const sourcePdf = await resolveQuizSourcePdfPath(root, manifestPath);
    const extractDirectory = path.join(path.dirname(sourcePdf), "source-extract");
    try {
      await fs.access(path.join(extractDirectory, "document.json"));
    } catch {
      await createExtraction(root, sourcePdf, extractDirectory);
    }
    return loadExtraction(sourcePdf, extractDirectory);
  })().finally(() => extractionTasks.delete(key));
  extractionTasks.set(key, task);
  return task;
}

export async function readQuizSourceExtractImage(root: string, manifestPath: unknown, assetValue: unknown): Promise<string> {
  if (typeof assetValue !== "string") throw new Error("Invalid extracted image.");
  const sourcePdf = await resolveQuizSourcePdfPath(root, manifestPath);
  const extractDirectory = path.join(path.dirname(sourcePdf), "source-extract");
  const assetPath = safeChild(extractDirectory, assetValue, "extracted image path");
  const mimeType = imageMimeTypes[path.extname(assetPath).toLowerCase()];
  if (!mimeType) throw new Error("This extracted image format cannot be previewed.");
  return `data:${mimeType};base64,${(await fs.readFile(assetPath)).toString("base64")}`;
}

export async function replaceQuizAssetFromSourceExtract(root: string, manifestPath: unknown, targetReference: unknown, sourceAssetValue: unknown): Promise<{ preview: string }> {
  if (typeof manifestPath !== "string" || typeof targetReference !== "string" || !targetReference.startsWith("asset:") || typeof sourceAssetValue !== "string")
    throw new Error("Invalid image selection.");
  const sourcePdf = await resolveQuizSourcePdfPath(root, manifestPath);
  const extractDirectory = path.join(path.dirname(sourcePdf), "source-extract");
  const sourceAsset = safeChild(extractDirectory, sourceAssetValue, "extracted image path");
  const assetsDirectory = path.join(path.dirname(manifestPath), "assets");
  const targetAsset = safeChild(assetsDirectory, imageAssetPath(targetReference), "quiz asset path");
  await fs.mkdir(assetsDirectory, { recursive: true });
  const sourceBytes = await fs.readFile(sourceAsset);
  const sourceExtension = path.extname(sourceAsset).toLowerCase();
  const targetExtension = path.extname(targetAsset).toLowerCase();
  const image = nativeImage.createFromBuffer(sourceBytes);
  if (image.isEmpty()) throw new Error("The selected extracted image is invalid.");
  let targetBytes: Buffer;
  if (targetExtension === ".png") targetBytes = image.toPNG();
  else if (targetExtension === ".jpg" || targetExtension === ".jpeg") targetBytes = image.toJPEG(95);
  else if (sourceExtension === targetExtension) targetBytes = sourceBytes;
  else throw new Error("Choose an extracted image with the same file type as the current question image.");
  await fs.writeFile(targetAsset, targetBytes);
  const mimeType = imageMimeTypes[targetExtension];
  if (!mimeType) throw new Error("The current question image format cannot be updated.");
  return { preview: `data:${mimeType};base64,${targetBytes.toString("base64")}` };
}

export async function addQuizAssetFromSourceExtract(
  root: string,
  manifestPath: unknown,
  sourceAssetValue: unknown,
): Promise<{ reference: string; preview: string }> {
  if (typeof manifestPath !== "string" || typeof sourceAssetValue !== "string")
    throw new Error("Invalid image selection.");
  const sourcePdf = await resolveQuizSourcePdfPath(root, manifestPath);
  const extractDirectory = path.join(path.dirname(sourcePdf), "source-extract");
  const sourceAsset = safeChild(extractDirectory, sourceAssetValue, "extracted image path");
  const extension = path.extname(sourceAsset).toLowerCase();
  const mimeType = imageMimeTypes[extension];
  if (!mimeType) throw new Error("This extracted image format cannot be added.");
  const bytes = await fs.readFile(sourceAsset);
  const image = nativeImage.createFromBuffer(bytes);
  if (image.isEmpty())
    throw new Error("The selected extracted image is invalid.");
  const size = image.getSize();
  const filename = `source-${createHash("sha256").update(bytes).digest("hex").slice(0, 16)}${extension}`;
  const assetsDirectory = path.join(path.dirname(manifestPath), "assets");
  await fs.mkdir(assetsDirectory, { recursive: true });
  await fs.writeFile(path.join(assetsDirectory, filename), bytes);
  return {
    reference: imageAssetReference(filename, size.width, size.height),
    preview: `data:${mimeType};base64,${bytes.toString("base64")}`,
  };
}
