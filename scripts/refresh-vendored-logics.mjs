import { createHash } from "node:crypto"
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"

const toolsRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const logicsRoot = resolve(toolsRoot, "../tnp-getgo-logics")
const vendorRoot = join(toolsRoot, "vendor")
const installedRoot = join(toolsRoot, "node_modules/@tnp/getgo-logics")

function run(command, args, cwd, capture = false) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, LANG: "C", LC_ALL: "C" },
    stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`)
  return result.stdout?.trim() ?? ""
}

async function filesBelow(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const path = join(current, entry.name)
    if (entry.isDirectory()) files.push(...await filesBelow(root, path))
    else if (entry.isFile()) files.push(relative(root, path))
  }
  return files.sort()
}

async function digest(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex")
}

async function verifyInstalledPackage(archivePath) {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "getgo-logics-verify-"))
  try {
    run("tar", ["-xzf", archivePath, "-C", temporaryRoot], toolsRoot)
    const packedRoot = join(temporaryRoot, "package")
    const packedFiles = await filesBelow(packedRoot)
    for (const file of packedFiles) {
      const packedHash = await digest(join(packedRoot, file))
      let installedHash
      try { installedHash = await digest(join(installedRoot, file)) }
      catch { throw new Error(`Vendored logics verification failed: node_modules is missing ${file}`) }
      if (installedHash !== packedHash) {
        throw new Error(`Vendored logics verification failed: node_modules contains stale ${file}`)
      }
    }
    console.log(`Verified ${packedFiles.length} installed logics files byte-for-byte.`)
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}

console.log("Checking and building @tnp/getgo-logics…")
run("npm", ["run", "check"], logicsRoot)

console.log("Packing @tnp/getgo-logics…")
const packOutput = run("npm", ["pack", "--json", "--pack-destination", vendorRoot], logicsRoot, true)
const packResult = JSON.parse(packOutput)
const filename = packResult[0]?.filename
if (typeof filename !== "string" || !filename.endsWith(".tgz")) throw new Error("npm pack did not return a tarball filename")
const archivePath = join(vendorRoot, basename(filename))

console.log(`Installing ${basename(archivePath)} explicitly…`)
run("npm", ["install", `./vendor/${basename(archivePath)}`, "--save"], toolsRoot)
await verifyInstalledPackage(archivePath)

console.log("Syncing editor types and checking GetGo Tools…")
run("npm", ["run", "sync:monaco-types"], toolsRoot)
run("npm", ["run", "typecheck"], toolsRoot)
run("npm", ["test"], toolsRoot)

console.log("Vendored logics refresh completed successfully. Restart GetGo Tools if it is already running.")
