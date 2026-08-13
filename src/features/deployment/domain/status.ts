import type { ContentStatus, DeploymentStatus } from "../../../shared/domain/models.js"

export function deriveDeploymentStatus(input: {
  contentStatus: ContentStatus
  hasGeneratedArtifact: boolean
  localArtifactHash: string | null
  remoteArtifactHash?: string | null
}): DeploymentStatus {
  if (!input.hasGeneratedArtifact) return "not-built"
  if (input.remoteArtifactHash === undefined) {
    return input.contentStatus === "published" ? "unknown" : "not-uploaded"
  }
  if (input.remoteArtifactHash === null) return "not-uploaded"
  if (!input.localArtifactHash) return "unknown"
  return input.localArtifactHash === input.remoteArtifactHash ? "uploaded" : "outdated"
}
