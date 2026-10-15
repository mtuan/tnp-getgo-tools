import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

const inlineImagePattern =
  /data:(image\/(?:avif|gif|jpeg|png|webp|svg\+xml));base64,([A-Za-z0-9+/]+={0,2})/g;

const imageExtensions: Record<string, string> = {
  "image/avif": "avif",
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/svg+xml": "svg",
  "image/webp": "webp",
};

interface ExtractedImage {
  dataUrl: string;
  data: Buffer;
  filename: string;
}

function collectInlineImages(value: unknown, images: Map<string, ExtractedImage>): void {
  if (typeof value === "string") {
    for (const match of value.matchAll(inlineImagePattern)) {
      const dataUrl = match[0];
      if (images.has(dataUrl)) continue;
      const data = Buffer.from(match[2], "base64");
      const hash = createHash("sha256").update(data).digest("hex").slice(0, 20);
      images.set(dataUrl, {
        dataUrl,
        data,
        filename: `inline-${hash}.${imageExtensions[match[1]]}`,
      });
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectInlineImages(item, images);
    return;
  }
  if (value && typeof value === "object")
    for (const item of Object.values(value as Record<string, unknown>))
      collectInlineImages(item, images);
}

function replaceInlineImages(
  value: unknown,
  images: Map<string, ExtractedImage>,
): unknown {
  if (typeof value === "string") {
    let result = value;
    for (const image of images.values())
      result = result.replaceAll(image.dataUrl, `asset:${image.filename}`);
    return result;
  }
  if (Array.isArray(value))
    return value.map((item) => replaceInlineImages(item, images));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        replaceInlineImages(item, images),
      ]),
    );
  return value;
}

export async function extractContentV2InlineImageAssets(
  value: unknown,
  assetsDirectory: string,
): Promise<{ value: unknown; extractedCount: number }> {
  const images = new Map<string, ExtractedImage>();
  collectInlineImages(value, images);
  if (!images.size) return { value, extractedCount: 0 };
  await fs.mkdir(assetsDirectory, { recursive: true });
  await Promise.all(
    [...images.values()].map((image) =>
      fs.writeFile(path.join(assetsDirectory, image.filename), image.data),
    ),
  );
  return {
    value: replaceInlineImages(value, images),
    extractedCount: images.size,
  };
}

export function containsContentV2InlineImage(value: unknown): boolean {
  if (typeof value === "string") {
    inlineImagePattern.lastIndex = 0;
    return inlineImagePattern.test(value);
  }
  if (Array.isArray(value)) return value.some(containsContentV2InlineImage);
  return Boolean(
    value &&
      typeof value === "object" &&
      Object.values(value as Record<string, unknown>).some(
        containsContentV2InlineImage,
      ),
  );
}
