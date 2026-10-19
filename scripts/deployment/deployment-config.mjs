import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptsDirectory = dirname(fileURLToPath(import.meta.url))

export const toolsRoot = resolve(process.env.GETGO_TOOLS_ROOT || join(scriptsDirectory, '..', '..'))
export const webRoot = resolve(process.env.GETGO_WEB_ROOT || join(toolsRoot, '..', 'tnp-getgo-web'))
export const logicsRoot = resolve(process.env.GETGO_LOGICS_ROOT || join(toolsRoot, '..', 'tnp-getgo-logics'))
export const deploysDir = join(toolsRoot, 'configs', 'deploys')

export function resolveDeploymentPath(relativePath) {
  return resolve(toolsRoot, relativePath)
}

export function loadDeploymentTargets() {
  if (!existsSync(deploysDir)) {
    throw new Error(
      `GetGo Tools deployment configuration was not found at ${deploysDir}. `
      + 'Clone tnp-getgo-tools beside tnp-getgo-web or set GETGO_TOOLS_ROOT.',
    )
  }

  return Object.fromEntries(
    readdirSync(deploysDir, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .flatMap(entry => {
        const configPath = join(deploysDir, entry.name, 'target.json')
        return existsSync(configPath)
          ? [[entry.name, JSON.parse(readFileSync(configPath, 'utf8'))]]
          : []
      }),
  )
}
