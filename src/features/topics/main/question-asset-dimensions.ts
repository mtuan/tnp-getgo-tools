import { promises as fs } from "node:fs"
import path from "node:path"
import { nativeImage } from "electron"
import { imageAssetReference, parseImageAssetReference } from "../../../shared/domain/image-asset-reference.js"

const referencePattern = /asset:([a-z0-9_./-]+\.(?:avif|gif|jpe?g|png|svg|webp))(?:\?width=\d+&height=\d+)?/gi

async function dimensions(filePath: string): Promise<{ width: number; height: number } | null> {
  if (!await fs.stat(filePath).then(value => value.isFile()).catch(() => false)) return null
  const size = nativeImage.createFromPath(filePath).getSize()
  return size.width > 0 && size.height > 0 ? size : null
}

export async function withQuestionAssetDimensions<T>(
  root: string,
  topicId: string,
  quizId: string,
  value: T,
): Promise<T> {
  const cache = new Map<string, Promise<string>>()
  const decorate = (reference: string): Promise<string> => {
    const parsed = parseImageAssetReference(reference)
    if (!parsed || (parsed.width && parsed.height)) return Promise.resolve(reference)
    const existing = cache.get(parsed.path)
    if (existing) return existing
    const result = (async () => {
      const candidates = [
        path.join(root, "content-v2", "topics", topicId, "quizzes", quizId, "assets", parsed.path),
        path.join(root, "content-v2", "topics", topicId, "assets", parsed.path),
      ]
      for (const candidate of candidates) {
        const size = await dimensions(candidate)
        if (size) return imageAssetReference(parsed.path, size.width, size.height)
      }
      return reference
    })()
    cache.set(parsed.path, result)
    return result
  }
  const visit = async (item: unknown): Promise<unknown> => {
    if (typeof item === "string") {
      const matches = [...item.matchAll(referencePattern)]
      let next = item
      for (const match of matches) next = next.replace(match[0], await decorate(match[0]))
      return next
    }
    if (Array.isArray(item)) return Promise.all(item.map(visit))
    if (!item || typeof item !== "object") return item
    return Object.fromEntries(await Promise.all(Object.entries(item).map(async ([key, child]) => [key, await visit(child)])))
  }
  return await visit(value) as T
}
