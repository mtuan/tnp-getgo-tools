import { spawn } from "node:child_process"
import electronPath from "electron"

const environment = { ...process.env }
delete environment.ELECTRON_RUN_AS_NODE

const child = spawn(electronPath, ["."], {
  cwd: process.cwd(),
  env: environment,
  stdio: "inherit",
})

child.once("error", error => {
  console.error(`Could not start Electron: ${error.message}`)
  process.exit(1)
})
child.once("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 1)
})
