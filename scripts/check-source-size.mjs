import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const warningLines = 400;
const maximumLines = 600;
const sourceRoot = new URL("../src/", import.meta.url);
const supported = new Set([".ts", ".tsx", ".js", ".jsx", ".cts", ".mts"]);
const excludedNames = new Set(["dist", "node_modules", "vendor"]);

function files(directory) {
  return readdirSync(directory).flatMap((name) => {
    if (excludedNames.has(name)) return [];
    const path = join(directory, name);
    return statSync(path).isDirectory()
      ? files(path)
      : supported.has(extname(name))
        ? [path]
        : [];
  });
}

function lineCount(path) {
  const source = readFileSync(path, "utf8");
  return source ? source.split(/\r?\n/).length : 0;
}

function changedFiles() {
  try {
    const output = execFileSync(
      "git",
      ["diff", "--name-only", "--diff-filter=ACMR", "HEAD", "--", "src"],
      { encoding: "utf8" },
    );
    return new Set(output.trim().split("\n").filter(Boolean));
  } catch {
    return new Set();
  }
}

function originalLineCount(path) {
  try {
    const source = execFileSync("git", ["show", `HEAD:${path}`], {
      encoding: "utf8",
    });
    return source ? source.split(/\r?\n/).length : 0;
  } catch {
    return 0;
  }
}

const rootPath = sourceRoot.pathname;
const changed = changedFiles();
const oversized = files(rootPath)
  .map((path) => ({
    path: `src/${relative(rootPath, path)}`,
    lines: lineCount(path),
  }))
  .filter((item) => item.lines > warningLines)
  .sort((left, right) => right.lines - left.lines);

if (!oversized.length) {
  console.log("Source size check: all hand-written source files are within 400 lines.");
  process.exit(0);
}

console.log("Source size report (target 150–300, warning >400, maximum 600):");
for (const item of oversized) {
  const marker = item.lines > maximumLines ? "OVER LIMIT" : "WARNING";
  console.log(`${marker.padEnd(10)} ${String(item.lines).padStart(5)}  ${item.path}`);
}

const violations = oversized.filter(
  (item) =>
    item.lines > maximumLines &&
    changed.has(item.path) &&
    item.lines > originalLineCount(item.path),
);
if (violations.length) {
  console.error(
    "\nChanged files above 600 lines must be reduced or documented as an allowed data/generated exception.",
  );
  process.exitCode = 1;
}
