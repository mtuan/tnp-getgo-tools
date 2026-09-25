import path from "node:path";

export type GetGoContentSource = "content" | "content-v2";

export function getGoContentSource(): GetGoContentSource {
  const configured = process.env.GETGO_CONTENT_SOURCE?.trim() || "content-v2";
  if (configured !== "content" && configured !== "content-v2")
    throw new Error('GETGO_CONTENT_SOURCE must be either "content" or "content-v2".');
  return configured;
}

export function contentDirectoryRoot(repositoryPath: string): string {
  return path.join(path.resolve(repositoryPath), getGoContentSource());
}

export function contentTopicsRoot(repositoryPath: string): string {
  return path.join(contentDirectoryRoot(repositoryPath), "topics");
}
