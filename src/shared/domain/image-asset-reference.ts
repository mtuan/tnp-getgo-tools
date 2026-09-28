export interface ImageAssetReference {
  path: string
  width?: number
  height?: number
}

export function parseImageAssetReference(value: string): ImageAssetReference | null {
  if (!value.startsWith("asset:")) return null
  const raw = value.slice("asset:".length)
  const queryIndex = raw.indexOf("?")
  const path = queryIndex < 0 ? raw : raw.slice(0, queryIndex)
  if (!path) return null
  const query = new URLSearchParams(queryIndex < 0 ? "" : raw.slice(queryIndex + 1))
  const width = Number(query.get("width"))
  const height = Number(query.get("height"))
  return {
    path,
    ...(Number.isInteger(width) && width > 0 ? { width } : {}),
    ...(Number.isInteger(height) && height > 0 ? { height } : {}),
  }
}

export function imageAssetReference(path: string, width: number, height: number): string {
  return `asset:${path}?width=${Math.round(width)}&height=${Math.round(height)}`
}

export function imageAssetPath(value: string): string {
  return parseImageAssetReference(value)?.path ?? value.replace(/^asset:/, "")
}
