import assert from "node:assert/strict"
import test from "node:test"
import { deriveDeploymentStatus } from "../src/core/status.js"

test("a quiz without a generated artifact is not built", () => {
  assert.equal(deriveDeploymentStatus({ contentStatus: "validated", hasGeneratedArtifact: false, localArtifactHash: null }), "not-built")
})

test("a local build that has never been published is not uploaded", () => {
  assert.equal(deriveDeploymentStatus({ contentStatus: "validated", hasGeneratedArtifact: true, localArtifactHash: "local" }), "not-uploaded")
})

test("published content requires remote reconciliation", () => {
  assert.equal(deriveDeploymentStatus({ contentStatus: "published", hasGeneratedArtifact: true, localArtifactHash: "local" }), "unknown")
})

test("matching and differing hashes derive uploaded and outdated", () => {
  assert.equal(deriveDeploymentStatus({ contentStatus: "published", hasGeneratedArtifact: true, localArtifactHash: "same", remoteArtifactHash: "same" }), "uploaded")
  assert.equal(deriveDeploymentStatus({ contentStatus: "published", hasGeneratedArtifact: true, localArtifactHash: "new", remoteArtifactHash: "old" }), "outdated")
})
