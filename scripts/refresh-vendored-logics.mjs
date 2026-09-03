import { createHash } from "node:crypto"
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"

const toolsRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const vendorRoot = join(toolsRoot, "vendor")
const installedRoot = join(toolsRoot, "node_modules/@tnp/getgo-logics")
const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm"

async function isLogicsRepository(candidate) {
  try {
    const manifest = JSON.parse(await readFile(join(candidate, "package.json"), "utf8"))
    return manifest.name === "@tnp/getgo-logics"
  } catch {
    return false
  }
}

async function findLogicsRepository() {
  const configured = process.env.GETGO_LOGICS_ROOT?.trim()
  if (configured) {
    const candidate = resolve(configured)
    if (await isLogicsRepository(candidate)) return candidate
    throw new Error(`GETGO_LOGICS_ROOT does not point to @tnp/getgo-logics: ${candidate}`)
  }
  const roots = [toolsRoot, dirname(toolsRoot), dirname(dirname(toolsRoot))]
  const candidates = roots.flatMap(root => [
    join(root, "tnp-getgo-logics"),
    join(dirname(root), "tnp-getgo-logics"),
  ])
  for (const candidate of [...new Set(candidates)])
    if (await isLogicsRepository(candidate)) return candidate
  throw new Error("GetGo Logics repository was not found. Set GETGO_LOGICS_ROOT to its absolute path.")
}

const logicsRoot = await findLogicsRepository()

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
run(npmExecutable, ["run", "check"], logicsRoot)

console.log("Packing @tnp/getgo-logics…")
const packOutput = run(npmExecutable, ["pack", "--json", "--pack-destination", vendorRoot], logicsRoot, true)
const packResult = JSON.parse(packOutput)
const filename = packResult[0]?.filename
if (typeof filename !== "string" || !filename.endsWith(".tgz")) throw new Error("npm pack did not return a tarball filename")
const archivePath = join(vendorRoot, basename(filename))

console.log(`Installing ${basename(archivePath)} explicitly…`)
run(npmExecutable, ["install", `./vendor/${basename(archivePath)}`, "--save"], toolsRoot)
await verifyInstalledPackage(archivePath)

console.log("Syncing editor types and checking GetGo Tools…")
run(npmExecutable, ["run", "sync:monaco-types"], toolsRoot)
run(npmExecutable, ["run", "typecheck"], toolsRoot)
run(npmExecutable, ["test"], toolsRoot)

console.log("Vendored logics refresh completed successfully. Restart GetGo Tools if it is already running.")
