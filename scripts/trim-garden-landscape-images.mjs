import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { PNG } = require("pngjs");

const toolRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetsRoot = path.join(toolRoot, "design", "kids-friendly", "shared", "assets");

const jobs = [
  {
    label: "header",
    input: path.join(assetsRoot, "garden-header-landscape.png"),
    output: path.join(assetsRoot, "garden-header-landscape-trimmed.png"),
    trimTop: 195,
    trimBottom: 0,
  },
  {
    label: "footer",
    input: path.join(assetsRoot, "garden-footer-landscape.png"),
    output: path.join(assetsRoot, "garden-footer-landscape-trimmed.png"),
    trimTop: 0,
    trimBottom: 185,
  },
];

async function trim({ label, input, output, trimTop, trimBottom }) {
  if (path.resolve(input) === path.resolve(output)) {
    throw new Error(`Refusing to overwrite the ${label} source image.`);
  }

  const source = PNG.sync.read(await readFile(input));
  const height = source.height - trimTop - trimBottom;
  if (height <= 0) {
    throw new Error(`${label} trims remove the entire ${source.height}px image.`);
  }

  const result = new PNG({ width: source.width, height });
  const rowBytes = source.width * 4;
  source.data.copy(
    result.data,
    0,
    trimTop * rowBytes,
    (trimTop + height) * rowBytes,
  );

  await writeFile(output, PNG.sync.write(result));
  console.log(
    `${label}: ${source.width}x${source.height} -> ${result.width}x${result.height} (${output})`,
  );
}

for (const job of jobs) {
  await trim(job);
}
