import { execFile } from "node:child_process"
import { access, mkdir, rename } from "node:fs/promises"
import { constants } from "node:fs"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"

const exec = promisify(execFile)
const launchEnvironment = { ...process.env }
delete launchEnvironment.ELECTRON_RUN_AS_NODE

if (process.platform !== "darwin")
  throw new Error("install:local currently supports macOS only.")

const projectRoot = process.cwd()
const architecture = process.arch === "arm64" ? "mac-arm64" : "mac"
const source = path.join(projectRoot, "release", architecture, "GetGo Tools.app")
const target = "/Applications/GetGo Tools.app"
const trash = path.join(os.homedir(), ".Trash")

await access(source, constants.R_OK)
await mkdir(trash, { recursive: true })

try {
  await exec("osascript", ["-e", 'tell application "GetGo Tools" to quit'])
} catch {
  // The app is not running.
}

await new Promise(resolve => setTimeout(resolve, 750))

try {
  await access(target)
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  await rename(target, path.join(trash, `GetGo Tools previous ${stamp}.app`))
} catch (error) {
  if (error?.code !== "ENOENT") throw error
}

await exec("ditto", [source, target])
await exec("codesign", ["--force", "--deep", "--sign", "-", target])
await exec("codesign", ["--verify", "--deep", "--strict", target])
await exec("open", ["-a", target], { env: launchEnvironment })
await new Promise(resolve => setTimeout(resolve, 2_000))
await exec("pgrep", ["-f", `${target}/Contents/MacOS/GetGo Tools`])
console.log(`Installed and launched ${target}`)
