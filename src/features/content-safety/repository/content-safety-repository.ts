import { promises as fs } from "node:fs";
import path from "node:path";
import { defaultSafeWordDictionary, findUnsafeContent, normalizeSafeWordDictionary, unsafeContentMessage, type SafeWordDictionary, type UnsafeContentFinding } from "../domain/content-safety.js";

const dictionaryPath = (root: string) => path.join(root, "content-v2", "safe-words.json");

export async function loadSafeWordDictionary(root: string): Promise<SafeWordDictionary> {
  try {
    return normalizeSafeWordDictionary(JSON.parse(await fs.readFile(dictionaryPath(root), "utf8")));
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause;
    return structuredClone(defaultSafeWordDictionary);
  }
}

export async function saveSafeWordDictionary(root: string, value: unknown): Promise<SafeWordDictionary> {
  const dictionary = normalizeSafeWordDictionary(value);
  await fs.mkdir(path.dirname(dictionaryPath(root)), { recursive: true });
  await fs.writeFile(dictionaryPath(root), `${JSON.stringify(dictionary, null, 2)}\n`, "utf8");
  return dictionary;
}

export async function inspectRepositoryContent(root: string, value: unknown): Promise<UnsafeContentFinding[]> {
  return findUnsafeContent(value, await loadSafeWordDictionary(root));
}

let warningHandler: ((warning: { label: string; findings: UnsafeContentFinding[] }) => void) | undefined;
export function setContentSafetyWarningHandler(handler: typeof warningHandler): void { warningHandler = handler; }

export async function warnForRepositoryContent(root: string, label: string, value: unknown): Promise<UnsafeContentFinding[]> {
  const findings = await inspectRepositoryContent(root, value);
  if (findings.length) {
    console.warn("[GetGo Tools][Content safety][save warning]", { label, findings });
    warningHandler?.({ label, findings });
  }
  return findings;
}

export async function warnForContentV2File(filePath: string, value: unknown): Promise<void> {
  const marker = `${path.sep}content-v2${path.sep}`;
  const index = filePath.indexOf(marker);
  if (index < 0 || filePath.endsWith(`${path.sep}safe-words.json`)) return;
  const root = filePath.slice(0, index);
  await warnForRepositoryContent(root, path.relative(root, filePath), value);
}

export async function assertRepositoryContentSafe(root: string, label: string, value: unknown): Promise<void> {
  const findings = await inspectRepositoryContent(root, value);
  if (findings.length) throw new Error(unsafeContentMessage(label, findings));
}
