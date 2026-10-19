#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { deploysDir as deploysRoot, logicsRoot, resolveDeploymentPath, webRoot } from './deployment-config.mjs'

const root = webRoot
const localBackendRoot = join(logicsRoot, 'firebase-backend')
const backendRoot = existsSync(localBackendRoot)
  ? localBackendRoot
  : join(root, 'node_modules', '@tnp', 'getgo-logics', 'firebase-backend')
const functionsRoot = join(backendRoot, 'functions', 'getgo')
const registryPath = join(functionsRoot, 'callables.json')
const exportsPath = join(functionsRoot, '_exports.json')
const requestedTargets = process.argv.slice(2).filter(value => !value.startsWith('--'))
const errors = []

function readJson(path, label) {
  if (!existsSync(path)) {
    errors.push(`Missing ${label}: ${relative(root, path)}`)
    return null
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    errors.push(`Invalid ${label}: ${relative(root, path)} (${error.message})`)
    return null
  }
}

function sourceFiles(path) {
  if (!existsSync(path)) return []
  return readdirSync(path, { withFileTypes: true }).flatMap(entry => {
    const child = join(path, entry.name)
    if (entry.isDirectory()) return sourceFiles(child)
    return entry.name.endsWith('.ts') ? [child] : []
  })
}

function discoverExportedFunctions() {
  const discovered = new Map()
  for (const path of sourceFiles(functionsRoot)) {
    const source = readFileSync(path, 'utf8')
    const expression = /export\s+const\s+([A-Za-z_$][\w$]*)\s*=\s*(onCall|on[A-Z][\w$]*)\b/g
    for (const match of source.matchAll(expression)) {
      const [, name, factory] = match
      if (discovered.has(name)) {
        errors.push(`Duplicate Functions source export: ${name}`)
      } else {
        discovered.set(name, {
          kind: factory === 'onCall' ? 'callable' : 'trigger',
          path,
          source,
        })
      }
    }
  }
  return discovered
}

function discoverRawClientCalls() {
  const allowedPath = join(root, 'src', 'platform', 'getgo', 'callable.ts')
  for (const path of sourceFiles(join(root, 'src'))) {
    if (path === allowedPath) continue
    const source = readFileSync(path, 'utf8')
    if (/\bhttpsCallable\s*(?:<[^;]*?>)?\s*\(/s.test(source)) {
      errors.push(
        `Raw httpsCallable usage in ${relative(root, path)}; use getGoCallable(contractKey) instead.`,
      )
    }
  }
}

const registry = readJson(registryPath, 'GetGo callable registry') ?? {}
const exportsConfig = readJson(exportsPath, 'GetGo Functions exports')
const exportGroups = exportsConfig?.exports ?? []
const discovered = discoverExportedFunctions()
const registeredNames = new Map()

for (const [key, contract] of Object.entries(registry)) {
  if (!contract || typeof contract.name !== 'string' || typeof contract.codebase !== 'string') {
    errors.push(`Invalid callable contract "${key}": name and codebase are required.`)
    continue
  }
  if (registeredNames.has(contract.name)) {
    errors.push(`Callable ${contract.name} is registered more than once.`)
  }
  registeredNames.set(contract.name, key)
  const source = discovered.get(contract.name)
  if (!source) {
    errors.push(`Callable ${contract.name} is registered but has no exported onCall source.`)
  } else {
    if (source.kind !== 'callable') errors.push(`${contract.name} is registered as callable but is a trigger.`)
    if (!source.source.includes('region: DEPLOYMENT_REGION')) {
      errors.push(`${contract.name} must use region: DEPLOYMENT_REGION.`)
    }
  }
  const group = exportGroups.find(candidate => candidate.codebase === contract.codebase)
  if (!group) {
    errors.push(`${contract.name} references missing export codebase "${contract.codebase}".`)
  } else if (!group.names?.includes(contract.name)) {
    errors.push(`${contract.name} is missing from _exports.json codebase "${contract.codebase}".`)
  } else if (source) {
    const sourcePath = relative(functionsRoot, source.path).replaceAll('\\', '/')
    if (!(group.files ?? []).includes(sourcePath)) {
      errors.push(
        `${contract.name} is implemented in ${sourcePath}, but codebase "${contract.codebase}" does not include that file.`,
      )
    }
  }
}

for (const [name, source] of discovered) {
  if (source.kind === 'callable' && !registeredNames.has(name)) {
    errors.push(
      `Unregistered callable ${name} in ${relative(root, source.path)}; add it to the Logics callable registry.`,
    )
  }
}

const exportedNames = new Map()
for (const group of exportGroups) {
  for (const file of group.files ?? []) {
    if (!existsSync(join(functionsRoot, file))) {
      errors.push(`Codebase "${group.codebase}" references missing source file: ${file}`)
    }
  }
  for (const name of group.names ?? []) {
    if (exportedNames.has(name)) errors.push(`Function ${name} appears in multiple export codebases.`)
    exportedNames.set(name, group.codebase)
    if (!discovered.has(name)) {
      errors.push(`_exports.json contains ${name}, but no matching exported Function source exists.`)
    }
  }
}

for (const name of discovered.keys()) {
  if (!exportedNames.has(name)) errors.push(`Exported Function ${name} is missing from _exports.json.`)
}

discoverRawClientCalls()

const availableTargets = readdirSync(deploysRoot, { withFileTypes: true })
  .filter(entry => entry.isDirectory() && existsSync(join(deploysRoot, entry.name, 'target.json')))
  .map(entry => entry.name)
const targets = requestedTargets.length > 0 ? requestedTargets : availableTargets

for (const targetName of targets) {
  const targetPath = join(deploysRoot, targetName, 'target.json')
  const target = readJson(targetPath, `target ${targetName}`)
  if (!target) continue
  if (!(target.apps ?? []).includes('getgo')) continue
  const firebaseConfigPath = resolveDeploymentPath(target.firebaseConfig)
  const firebaseConfig = readJson(firebaseConfigPath, `Firebase config for ${targetName}`)
  const firebaseCodebases = new Map(
    (firebaseConfig?.functions ?? []).map(item => [item.codebase, item.source]),
  )
  const targetCodebases = new Map(
    (target.functionCodebases ?? []).map(item => [item.id, item.name]),
  )
  for (const group of exportGroups) {
    const expectedName = `getgo-${group.codebase}`
    const configuredName = targetCodebases.get(group.codebase)
    if (configuredName !== expectedName) {
      errors.push(
        `[${targetName}] codebase "${group.codebase}" must map to "${expectedName}" (found ${configuredName ?? 'nothing'}).`,
      )
    }
    const expectedSource = `functions-${group.codebase}`
    if (firebaseCodebases.get(expectedName) !== expectedSource) {
      errors.push(
        `[${targetName}] Firebase codebase "${expectedName}" must use source "${expectedSource}".`,
      )
    }
  }
  if (!target.functionsRegion) {
    errors.push(`[${targetName}] functionsRegion must be explicit.`)
  }
}

if (errors.length > 0) {
  console.error('\n❌ GetGo callable contract validation failed:\n')
  for (const error of errors) console.error(`  • ${error}`)
  console.error('')
  process.exit(1)
}

console.log(
  `✅ GetGo callable contracts: ${registeredNames.size} callables, ` +
  `${discovered.size} total Functions, ${targets.length} targets checked.`,
)
