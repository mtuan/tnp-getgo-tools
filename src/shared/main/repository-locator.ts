import { promises as fs } from "node:fs";
import path from "node:path";

interface RepositorySpec {
  packageName: string;
  directoryName: string;
  environmentVariable?: string;
  requiredDirectory?: string;
}

const ignoredDirectories = new Set([
  ".git", ".expo", ".next", ".turbo", ".vite", "coverage", "dist",
  "Library", "node_modules", "release",
]);

async function isRepository(candidate: string, spec: RepositorySpec) {
  try {
    const manifest = JSON.parse(await fs.readFile(path.join(candidate, "package.json"), "utf8")) as { name?: string };
    if (manifest.name !== spec.packageName) return false;
    if (spec.requiredDirectory)
      return (await fs.stat(path.join(candidate, spec.requiredDirectory))).isDirectory();
    return true;
  } catch {
    return false;
  }
}

function searchRoots(toolsAppPath: string) {
  const roots = new Set<string>();
  for (const initial of [toolsAppPath, process.cwd()]) {
    let current = path.resolve(initial);
    for (let level = 0; level < 3; level += 1) {
      roots.add(current);
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
  return [...roots];
}

async function findBelow(root: string, spec: RepositorySpec, maxDepth: number) {
  const queue = [{ directory: root, depth: 0 }];
  let inspected = 0;
  while (queue.length && inspected < 4_000) {
    const current = queue.shift()!;
    inspected += 1;
    if (await isRepository(current.directory, spec)) return current.directory;
    if (current.depth >= maxDepth) continue;
    const entries = await fs.readdir(current.directory, { withFileTypes: true }).catch(() => []);
    const directories = entries
      .filter(entry => entry.isDirectory() && !ignoredDirectories.has(entry.name) && !entry.name.startsWith("."))
      .sort((left, right) => Number(right.name === spec.directoryName) - Number(left.name === spec.directoryName));
    queue.push(...directories.map(entry => ({
      directory: path.join(current.directory, entry.name),
      depth: current.depth + 1,
    })));
  }
  return null;
}

export async function findRelatedRepository(toolsAppPath: string, spec: RepositorySpec) {
  const configured = spec.environmentVariable
    ? process.env[spec.environmentVariable]?.trim()
    : undefined;
  if (configured) {
    const resolved = path.resolve(configured);
    if (await isRepository(resolved, spec)) return resolved;
    throw new Error(`${spec.environmentVariable} does not point to ${spec.packageName}: ${resolved}`);
  }

  const roots = searchRoots(toolsAppPath);
  for (const root of roots.slice(0, 4)) {
    for (const candidate of [
      path.join(root, spec.directoryName),
      path.join(path.dirname(root), spec.directoryName),
    ])
      if (await isRepository(candidate, spec)) return candidate;
    const found = await findBelow(root, spec, 3);
    if (found) return found;
  }
  return null;
}
