import { promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import convertHeic from "heic-convert";
import type { ImagePdfInput, ImagePdfOrientation, ImagePdfSelection } from "../../../shared/domain/models.js";

const mimeTypes: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".gif": "image/gif", ".bmp": "image/bmp", ".svg": "image/svg+xml",
  ".heic": "image/heic", ".heif": "image/heif",
};
const isHeicPath = (filePath: string) => /\.hei[cf]$/i.test(filePath);
export const imagePdfExtensions = Object.keys(mimeTypes).map((value) => value.slice(1));
export const isImagePdfPath = (filePath: string) => Boolean(mimeTypes[path.extname(filePath).toLowerCase()]);

async function browserImage(filePath: string, bytes: Buffer): Promise<{ data: Buffer; mimeType: string }> {
  if (!isHeicPath(filePath)) {
    return { data: bytes, mimeType: mimeTypes[path.extname(filePath).toLowerCase()]! };
  }
  try {
    const converted = await convertHeic({ buffer: bytes, format: "JPEG", quality: 0.92 });
    return { data: Buffer.from(converted), mimeType: "image/jpeg" };
  } catch (cause) {
    throw new Error(`Could not decode HEIC image ${path.basename(filePath)}.`, { cause });
  }
}

export async function loadImagePdfSelection(inputPaths: string[]): Promise<ImagePdfSelection> {
  if (!Array.isArray(inputPaths) || !inputPaths.length || inputPaths.some((value) => typeof value !== "string" || !path.isAbsolute(value)))
    throw new Error("Select valid image files or folders.");
  const files: string[] = [];
  let selectedDirectory: string | null = null;
  for (const inputPath of inputPaths) {
    const stats = await fs.stat(inputPath);
    if (stats.isDirectory()) {
      selectedDirectory ??= inputPath;
      const entries = await fs.readdir(inputPath, { withFileTypes: true });
      files.push(...entries.filter((entry) => entry.isFile() && mimeTypes[path.extname(entry.name).toLowerCase()]).map((entry) => path.join(inputPath, entry.name)));
    } else if (stats.isFile() && mimeTypes[path.extname(inputPath).toLowerCase()]) files.push(inputPath);
  }
  const images: ImagePdfInput[] = await Promise.all([...new Set(files)].map(async (filePath) => {
    const [stats, bytes] = await Promise.all([fs.stat(filePath), fs.readFile(filePath)]);
    const browser = await browserImage(filePath, bytes);
    return { path: filePath, directory: path.dirname(filePath), name: path.basename(filePath), size: stats.size, mimeType: browser.mimeType, data: browser.data.buffer.slice(browser.data.byteOffset, browser.data.byteOffset + browser.data.byteLength) as ArrayBuffer };
  }));
  return { images, defaultDirectory: selectedDirectory ?? images[0]?.directory ?? null };
}

async function sourceOrientation(filePath: string): Promise<0 | 90 | 180 | 270> {
  if (!/\.jpe?g$/i.test(filePath) || process.platform !== "darwin") return 0;
  return new Promise((resolve) => {
    const child = spawn("/usr/bin/sips", ["-g", "orientation", filePath], { stdio: ["ignore", "pipe", "ignore"] });
    let output = "";
    child.stdout.on("data", (chunk) => { output += String(chunk); });
    child.on("error", () => resolve(0));
    child.on("close", () => {
      const orientation = Number(output.match(/orientation:\s*(\d+)/i)?.[1]);
      resolve(orientation === 3 || orientation === 4 ? 180 : orientation === 5 || orientation === 6 ? 90 : orientation === 7 || orientation === 8 ? 270 : 0);
    });
  });
}

async function deskew(executable: string, filePath: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(executable, [filePath, "stdout", "--psm", "6", "hocr"], { stdio: ["ignore", "pipe", "ignore"] });
    let hocr = "";
    child.stdout.on("data", (chunk) => { hocr += String(chunk); });
    child.on("error", () => resolve(0));
    child.on("close", () => {
      const slopes = [...hocr.matchAll(/baseline\s+(-?(?:\d+(?:\.\d+)?|\.\d+))/gi)].map((match) => Number(match[1])).filter((value) => Number.isFinite(value) && Math.abs(value) <= 0.35).sort((left, right) => left - right);
      if (!slopes.length) return resolve(0);
      const middle = Math.floor(slopes.length / 2);
      const median = slopes.length % 2 ? slopes[middle] : (slopes[middle - 1] + slopes[middle]) / 2;
      const angle = Math.max(-15, Math.min(15, (-Math.atan(median) * 180) / Math.PI));
      resolve(Math.abs(angle) >= 0.2 ? Math.round(angle * 10) / 10 : 0);
    });
  });
}

async function tesseractExecutable(): Promise<string> {
  const candidates = [process.env.TESSERACT_PATH, "/opt/homebrew/bin/tesseract", "/usr/local/bin/tesseract"].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) try { await fs.access(candidate); return candidate; } catch { /* try next */ }
  return "tesseract";
}

async function detectImageOrientation(filePath: string): Promise<ImagePdfOrientation> {
  let analysisPath = filePath;
  let temporaryDirectory: string | undefined;
  if (isHeicPath(filePath)) {
    temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "getgo-image-pdf-"));
    analysisPath = path.join(temporaryDirectory, `${path.parse(filePath).name}.jpg`);
    const browser = await browserImage(filePath, await fs.readFile(filePath));
    await fs.writeFile(analysisPath, browser.data);
  }
  const [executable, source] = await Promise.all([tesseractExecutable(), sourceOrientation(filePath)]);
  try {
    return await new Promise((resolve, reject) => {
    const child = spawn(executable, [analysisPath, "stdout", "--psm", "0"], { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => { output += String(chunk); });
    child.stderr.on("data", (chunk) => { output += String(chunk); });
    child.on("error", (cause) => reject((cause as NodeJS.ErrnoException).code === "ENOENT" ? new Error("Text orientation detection requires Tesseract OCR. Install it with: brew install tesseract") : cause));
    child.on("close", async () => {
      const raw = Number(output.match(/Rotate:\s*(0|90|180|270)/i)?.[1]);
      const confidence = Number(output.match(/Orientation confidence:\s*([\d.]+)/i)?.[1]);
      const detected = [0, 90, 180, 270].includes(raw);
      const broad = detected ? (raw - source + 360) % 360 : 0;
      const deskewRotation = detected && raw === 0 && source === 0 ? await deskew(executable, analysisPath) : 0;
      const rotation = Math.round((broad + deskewRotation) * 10) / 10;
      resolve({ path: filePath, rotation, ...(detected ? { rawRotation: raw as 0 | 90 | 180 | 270 } : {}), sourceOrientation: source, deskewRotation, ...(Number.isFinite(confidence) ? { confidence } : {}), detected });
    });
    });
  } finally {
    if (temporaryDirectory) await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
}

export async function detectImageOrientations(paths: string[]): Promise<ImagePdfOrientation[]> {
  const results = new Array<ImagePdfOrientation>(paths.length);
  let nextIndex = 0;
  const worker = async () => { while (nextIndex < paths.length) { const index = nextIndex++; results[index] = await detectImageOrientation(paths[index]); } };
  await Promise.all(Array.from({ length: Math.min(2, paths.length) }, worker));
  return results;
}
