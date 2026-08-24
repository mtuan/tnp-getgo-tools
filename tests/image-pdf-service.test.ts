import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import {
  imagePdfExtensions,
  isImagePdfPath,
  loadImagePdfSelection,
} from "../src/features/image-pdf/main/image-pdf-service.js";

const execFileAsync = promisify(execFile);

test("image PDF inputs accept HEIC and HEIF files", () => {
  assert.equal(isImagePdfPath("/photos/example.heic"), true);
  assert.equal(isImagePdfPath("/photos/example.HEIF"), true);
  assert.ok(imagePdfExtensions.includes("heic"));
  assert.ok(imagePdfExtensions.includes("heif"));
});

test("image PDF inputs decode HEIC into browser-safe JPEG data", {
  skip: process.platform !== "darwin" ? "fixture generation uses macOS sips" : false,
}, async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "getgo-heic-test-"));
  try {
    const pngPath = path.join(directory, "source.png");
    const heicPath = path.join(directory, "source.heic");
    const onePixelPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    );
    await fs.writeFile(pngPath, onePixelPng);
    await execFileAsync("/usr/bin/sips", ["-s", "format", "heic", pngPath, "--out", heicPath]);

    const selection = await loadImagePdfSelection([heicPath]);
    assert.equal(selection.images[0]?.mimeType, "image/jpeg");
    assert.ok((selection.images[0]?.data.byteLength ?? 0) > 0);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
