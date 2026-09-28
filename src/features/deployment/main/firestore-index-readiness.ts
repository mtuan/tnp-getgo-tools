import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type IndexField = {
  fieldPath: string;
  order?: "ASCENDING" | "DESCENDING";
  arrayConfig?: "CONTAINS";
};

type RequiredIndex = {
  collectionGroup: string;
  queryScope: "COLLECTION" | "COLLECTION_GROUP";
  fields: IndexField[];
};

type RemoteIndex = {
  name: string;
  queryScope: "COLLECTION" | "COLLECTION_GROUP";
  state: string;
  fields: IndexField[];
};

export type FirestoreIndexReadiness = {
  ready: number;
  total: number;
  pending: Array<{ collectionGroup: string; state: string }>;
};

export class FirestoreIndexWaitCancelledError extends Error {
  constructor() {
    super("Waiting for Firestore indexes was cancelled.");
    this.name = "FirestoreIndexWaitCancelledError";
  }
}

function collectionGroupFromName(name: string) {
  return decodeURIComponent(name.match(/\/collectionGroups\/([^/]+)\/indexes\//)?.[1] ?? "");
}

function normalizedFields(fields: IndexField[]) {
  return fields
    .filter((field) => field.fieldPath !== "__name__")
    .map((field) => `${field.fieldPath}:${field.order ?? field.arrayConfig ?? ""}`)
    .join("|");
}

function signature(index: Pick<RequiredIndex, "collectionGroup" | "queryScope" | "fields">) {
  return `${index.collectionGroup}:${index.queryScope}:${normalizedFields(index.fields)}`;
}

export function inspectFirestoreIndexReadiness(required: RequiredIndex[], remote: RemoteIndex[]): FirestoreIndexReadiness {
  const remoteBySignature = new Map(remote.map((index) => [signature({
    collectionGroup: collectionGroupFromName(index.name),
    queryScope: index.queryScope,
    fields: index.fields,
  }), index]));
  const pending: FirestoreIndexReadiness["pending"] = [];
  let ready = 0;
  for (const index of required) {
    const remoteIndex = remoteBySignature.get(signature(index));
    const state = remoteIndex?.state ?? "NOT_FOUND";
    if (state === "READY") ready += 1;
    else pending.push({ collectionGroup: index.collectionGroup, state });
  }
  return { ready, total: required.length, pending };
}

async function requiredIndexes(webRoot: string): Promise<RequiredIndex[]> {
  const filePath = path.join(webRoot, "configs", "deploys", "getgo", "firestore.indexes.json");
  const configuration = JSON.parse(await fs.readFile(filePath, "utf8")) as { indexes?: RequiredIndex[] };
  return configuration.indexes ?? [];
}

async function remoteIndexes(firebaseProject: string): Promise<RemoteIndex[]> {
  const executable = process.platform === "win32" ? "gcloud.cmd" : "gcloud";
  try {
    const { stdout } = await execFileAsync(executable, [
      "firestore", "indexes", "composite", "list",
      `--project=${firebaseProject}`,
      "--format=json",
    ], { maxBuffer: 10 * 1024 * 1024 });
    return JSON.parse(stdout) as RemoteIndex[];
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`Could not verify Firestore index readiness with Google Cloud CLI: ${detail}`);
  }
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

export async function waitForFirestoreIndexes(options: {
  webRoot: string;
  firebaseProject: string;
  isCancelled: () => boolean;
  onStatus: (status: FirestoreIndexReadiness) => Promise<void> | void;
  pollIntervalMs?: number;
  timeoutMs?: number;
}) {
  const required = await requiredIndexes(options.webRoot);
  if (!required.length) return;
  const startedAt = Date.now();
  const pollIntervalMs = options.pollIntervalMs ?? 5_000;
  const timeoutMs = options.timeoutMs ?? 45 * 60_000;
  while (true) {
    if (options.isCancelled()) throw new FirestoreIndexWaitCancelledError();
    const status = inspectFirestoreIndexReadiness(required, await remoteIndexes(options.firebaseProject));
    await options.onStatus(status);
    if (status.ready === status.total) return;
    const failed = status.pending.filter((index) => !["CREATING", "NOT_FOUND"].includes(index.state));
    if (failed.length) {
      throw new Error(`Firestore index creation failed: ${failed.map((index) => `${index.collectionGroup} (${index.state})`).join(", ")}.`);
    }
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error(`Timed out waiting for Firestore indexes (${status.ready}/${status.total} READY).`);
    }
    await delay(pollIntervalMs);
  }
}
