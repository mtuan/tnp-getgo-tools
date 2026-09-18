import { execFileSync } from "node:child_process"

const DEV_PORT = 5174
const GRACEFUL_TIMEOUT_MS = 5_000
const POLL_INTERVAL_MS = 100

function listenerPids(port) {
  if (process.platform === "win32") {
    const output = execFileSync("netstat", ["-ano", "-p", "tcp"], { encoding: "utf8" })
    return [...new Set(output
      .split(/\r?\n/)
      .filter(line => line.includes(`:${port}`) && /LISTENING/i.test(line))
      .map(line => Number(line.trim().split(/\s+/).at(-1)))
      .filter(pid => Number.isInteger(pid) && pid > 0))]
  }

  try {
    const output = execFileSync(
      "lsof",
      ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"],
      { encoding: "utf8" },
    )
    return [...new Set(output
      .split(/\s+/)
      .map(Number)
      .filter(pid => Number.isInteger(pid) && pid > 0))]
  } catch (error) {
    if (error?.status === 1) return []
    throw error
  }
}

function signal(pid, force = false) {
  if (process.platform === "win32") {
    execFileSync("taskkill", ["/PID", String(pid), "/T", ...(force ? ["/F"] : [])], {
      stdio: "ignore",
    })
    return
  }
  process.kill(pid, force ? "SIGKILL" : "SIGTERM")
}

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))

const existing = listenerPids(DEV_PORT)
if (existing.length === 0) {
  console.log(`No running GetGo Tools dev server found on port ${DEV_PORT}.`)
  process.exit(0)
}

console.log(`Stopping existing GetGo Tools dev server on port ${DEV_PORT} (PID ${existing.join(", ")})…`)
for (const pid of existing) {
  try { signal(pid) }
  catch (error) {
    if (error?.code !== "ESRCH") throw error
  }
}

const deadline = Date.now() + GRACEFUL_TIMEOUT_MS
while (Date.now() < deadline && listenerPids(DEV_PORT).length > 0)
  await wait(POLL_INTERVAL_MS)

const remaining = listenerPids(DEV_PORT)
for (const pid of remaining) {
  console.warn(`GetGo Tools PID ${pid} did not stop gracefully; forcing shutdown.`)
  try { signal(pid, true) }
  catch (error) {
    if (error?.code !== "ESRCH") throw error
  }
}

if (listenerPids(DEV_PORT).length > 0)
  throw new Error(`Could not release GetGo Tools dev port ${DEV_PORT}.`)

console.log("Existing GetGo Tools dev process stopped.")
