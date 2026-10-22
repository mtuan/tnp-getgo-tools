#!/usr/bin/env node
/**
 * Smart build & deploy script.
 *
 * Automatically detects what changed since the last successful deploy and
 * only deploys the resources that actually need it:
 *   - Hosting          → when src/, public/, index.html, vite.config.ts, etc. change
 *   - Firestore rules  → when configs/deploys/<target>/firestore.rules changes
 *   - Firestore indexes → when configs/deploys/<target>/firestore.indexes.json changes
 *   - Storage rules    → when configs/deploys/<target>/storage.rules changes
 *
 * After every run, any config/env files accidentally modified by the pipeline
 * (e.g. .firebaserc, tsconfig.app.json) are automatically restored.
 *
 * Usage:
 *   node scripts/deployment/deploy-web.mjs <target> [options]
 *
 * Targets (folder-based: configs/deploys/<target>/target.json):
 *   getgo   — GetGo student learning platform
 *   hayhay  — HayHay company management
 *
 * Options:
 *   --force        Deploy ALL resources regardless of what changed
 *   --build-only   Run checks + build but skip the Firebase deploy step
 *   --no-lint      Skip ESLint
 *   --deploy-only   Deploy artifacts from a preceding successful build
 *   --scope=firebase Deploy Firestore/Storage rules, indexes, and Cloud Functions
 *   --scope=web     Deploy only Firebase Hosting
 *
 * Examples:
 *   node scripts/deployment/deploy-web.mjs getgo-dev
 *   node scripts/deployment/deploy-web.mjs getgo-staging --force
 *   node scripts/deployment/deploy-web.mjs getgo --build-only
 */

import { execSync, spawnSync }               from 'child_process'
import { tmpdir }                            from 'os'
import { readFileSync, writeFileSync, copyFileSync,
         existsSync, mkdirSync, readdirSync, rmSync, symlinkSync } from 'fs'
import { dirname, join, relative }           from 'path'
import { createHash }                        from 'crypto'
import { loadEnv }                           from 'vite'
import { ensureGoogleCloudService, ensureStorageFirestoreRulesIam, missingGoogleCloudSecrets } from './storage-firestore-iam.mjs'
import { functionDeployHashes } from './function-deploy-hashes.mjs'
import { deploysDir, loadDeploymentTargets, logicsRoot, resolveDeploymentPath, toolsRoot, webRoot } from './deployment-config.mjs'
import { assembleFirebaseConfig } from './assemble-firebase-config.mjs'

/** Normalize a filesystem path to forward-slashes (required for Firebase CLI on Windows). */
function toSlash(p) { return p.replace(/\\/g, '/') }

// ── Helpers ───────────────────────────────────────────────────────────────────

const root = webRoot
const rawArgs = process.argv.slice(2)
const deployOnly = rawArgs.includes('--deploy-only')
function run(cmd, label) {
  if (label) console.log(`\n  ${label}`)
  console.log(`  $ ${cmd}\n`)
  execSync(cmd, { stdio: 'inherit', cwd: root })
}

function runInDirectory(cmd, label, cwd) {
  if (label) console.log(`\n  ${label}`)
  console.log(`  $ ${cmd}\n`)
  execSync(cmd, { stdio: 'inherit', cwd })
}

/**
 * Like run(), but also captures output to detect fatal warning patterns.
 * Streams output live via a temp file tee, then post-checks the captured text.
 *
 * @param {string} cmd
 * @param {string} label
 * @param {Array<{pattern: RegExp, message: string, ignoreDetails?: Set<string>}>} fatalWarnings
 */
function runChecked(cmd, label, fatalWarnings = []) {
  if (label) console.log(`\n  ${label}`)
  console.log(`  $ ${cmd}\n`)
  const outFile = join(tmpdir(), `deploy-run-${Date.now()}.txt`)
  // Cross-platform: spawn the command via the system shell, pipe stdout/stderr
  // through Node so we can both display them live AND capture to a file.
  const childEnv = { ...process.env }
  delete childEnv.DEBUG
  delete childEnv.FIREBASE_DEBUG
  const child = spawnSync(cmd, {
    shell: true,
    cwd: root,
    env: {
      ...childEnv,
      // Firebase CLI gives the Functions runtime only 10 seconds to expose
      // its backend manifest by default. Cold dependency loading can exceed
      // that even when the module is healthy, so use Firebase's documented
      // discovery override for deploy subprocesses. Callers can still choose
      // a different value explicitly.
      FUNCTIONS_DISCOVERY_TIMEOUT:
        process.env.FUNCTIONS_DISCOVERY_TIMEOUT ?? '30',
    },
    stdio: ['inherit', 'pipe', 'pipe'],
    encoding: 'buffer',
    maxBuffer: 1024 * 1024 * 100,
  })
  const stdout = child.stdout?.toString('utf-8') ?? ''
  const stderr = child.stderr?.toString('utf-8') ?? ''
  if (stdout) process.stdout.write(stdout)
  if (stderr) process.stderr.write(stderr)
  try { writeFileSync(outFile, stdout + stderr) } catch { /* ignore */ }

  // Check captured output for fatal warning patterns (always, before throwing)
  const output = stdout + stderr
  for (const { pattern, message, ignoreDetails = new Set() } of fatalWarnings) {
    const matches = [...output.matchAll(pattern)]
    const details = [...new Set(matches.map(m => m[1]).filter(Boolean))]
      .filter(detail => !ignoreDetails.has(detail))
    if (details.length > 0) {
      const detail = details.join(', ')
      fail(`${message}${detail ? `: ${detail}` : ''}`)
    }
  }

  if (child.status !== 0) {
    const err = new Error(`Command failed with exit code ${child.status}: ${cmd}`)
    err.status = child.status
    err.output = output
    throw err
  }
}

function capture(cmd) {
  try { return execSync(cmd, { encoding: 'utf-8', cwd: root }).trim() }
  catch { return '' }
}

function configureStorageFirestoreRulesIam(projectId, storageRulesPath) {
  if (!existsSync(storageRulesPath)) return
  const source = readFileSync(storageRulesPath, 'utf8')
  try {
    const result = ensureStorageFirestoreRulesIam({
      projectId,
      storageRulesSource: source,
      execute: (command, args) => spawnSync(command, args, { cwd: root, encoding: 'utf8' }),
    })
    if (!result.required) return
    console.log(result.changed
      ? `  ✅ Cloud Storage-to-Firestore Rules IAM granted and verified for ${projectId}.`
      : `  ✅ Cloud Storage-to-Firestore Rules IAM verified for ${projectId}.`)
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error))
  }
}

function configureGoogleCloudService(projectId, service) {
  try {
    const result = ensureGoogleCloudService({
      projectId, service,
      execute: (command, args) => spawnSync(command, args, { cwd: root, encoding: 'utf8' }),
    })
    console.log(result.changed ? `  ✅ Enabled and verified ${service}.` : `  ✅ Verified ${service}.`)
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error))
  }
}

function findMissingRequiredSecrets(projectId, secrets = []) {
  const missing = missingGoogleCloudSecrets({
    projectId, secrets,
    execute: (command, args) => spawnSync(command, args, { cwd: root, encoding: 'utf8' }),
  })
  if (missing.length === 0) return []
  console.warn([
    `\n⚠️  Missing Firebase Functions secrets in ${projectId}: ${missing.join(', ')}`,
    'Function codebases that require these secrets will be skipped. All other resources will still deploy.',
    'To include the skipped Functions, set each secret and deploy again:',
    ...missing.map(secret => `firebase functions:secrets:set ${secret} --project ${projectId}`),
    '',
  ].join('\n'))
  return missing
}

const PREFLIGHT_CACHE_MS = 15 * 60 * 1000
function preflightCachePath(projectId) {
  return join(tmpdir(), `getgo-deploy-preflight-${projectId}.json`)
}

function readPreflightCache(projectId, fingerprint) {
  if (force) return null
  try {
    const value = JSON.parse(readFileSync(preflightCachePath(projectId), 'utf8'))
    if (value.fingerprint !== fingerprint || Date.now() - value.checkedAt > PREFLIGHT_CACHE_MS) return null
    return value
  } catch { return null }
}

function writePreflightCache(projectId, fingerprint, missingSecrets) {
  writeFileSync(preflightCachePath(projectId), JSON.stringify({ fingerprint, checkedAt: Date.now(), missingSecrets }), 'utf8')
}

function releaseProgress(completed, label) {
  console.log(`GETGO_RELEASE_PROGRESS ${JSON.stringify({ completed, total: 7, label })}`)
}

function fail(msg) {
  console.error(`\n❌  ${msg}\n`)
  process.exit(1)
}

const allTargets = loadDeploymentTargets()

// ── Config-file guard ─────────────────────────────────────────────────────────
// Records which protected files are already dirty before the pipeline runs,
// then restores any that were newly dirtied by the pipeline at the end.

// Files the guard watches — assembled output files are intentionally excluded
// so the guard doesn't undo the freshly generated firestore.rules / indexes.
const GUARD_PATHS = [
  'tsconfig.app.json',
  'tsconfig.json',
  '.firebaserc',
  // Per-target: protect env + firebase.json but NOT the assembled outputs
]

function guardSnapshot() {
  const out = capture(`git diff --name-only -- ${GUARD_PATHS.join(' ')}`)
  return new Set(out ? out.split('\n').filter(Boolean) : [])
}

function guardRestore(before) {
  const out   = capture(`git diff --name-only -- ${GUARD_PATHS.join(' ')}`)
  const dirty = out ? out.split('\n').filter(Boolean) : []
  const toRestore = dirty.filter(f => !before.has(f))
  if (toRestore.length === 0) return
  console.log('\n🔒  Restoring config files touched by the pipeline:')
  for (const f of toRestore) console.log(`     ${f}`)
  execSync(`git checkout -- ${toRestore.map(f => `"${f}"`).join(' ')}`, { stdio: 'inherit', cwd: root })
  console.log('     ✅  Restored.\n')
}

// ── Content-hash change detection ────────────────────────────────────────────
// Instead of comparing git SHAs (which misses uncommitted changes), we hash
// the actual build artifacts / assembled files for each resource type and
// compare against hashes stored from the last successful deploy.
// Stored as Tools-owned runtime state under .state/deployments (gitignored).

/**
 * Recursively hash all files under a directory.
 * Returns a hex SHA-256 string, or null if the path doesn't exist.
 */
function hashDir(dirPath) {
  if (!existsSync(dirPath)) return null
  const h = createHash('sha256')
  function walk(p) {
    const entries = readdirSync(p, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))
    for (const e of entries) {
      const full = join(p, e.name)
      if (e.isDirectory()) { walk(full) }
      else {
        h.update(full.slice(dirPath.length))  // relative path as part of hash
        h.update(readFileSync(full))
      }
    }
  }
  walk(dirPath)
  return h.digest('hex')
}

/**
 * Hash a single file. Returns null if the file doesn't exist.
 */
function hashFile(filePath) {
  if (!existsSync(filePath)) return null
  return createHash('sha256').update(readFileSync(filePath)).digest('hex')
}

function hashViteEnvFiles(digest, directory) {
  if (!existsSync(directory)) return
  for (const entry of readdirSync(directory, { withFileTypes: true })
    .filter(item => item.isFile() && (item.name === '.env' || item.name.startsWith('.env.')))
    .sort((left, right) => left.name.localeCompare(right.name))) {
    digest.update(entry.name)
    digest.update(readFileSync(join(directory, entry.name)))
  }
}

function hashHostingInputs() {
  const digest = createHash('sha256')
  for (const relativePath of [
    'src',
    'public',
    'plugins',
    'shared',
  ]) {
    digest.update(hashDir(join(root, relativePath)) ?? '')
  }
  for (const relativePath of [
    'index.html',
    'package.json',
    'package-lock.json',
    'tsconfig.app.json',
    'vite.config.ts',
  ]) {
    digest.update(hashFile(join(root, relativePath)) ?? '')
  }

  // The shared GetGo artifact embeds every environment so one bundle can
  // select the correct Firebase project from the current hostname. Hash every
  // environment file/target, not only the target selected for this deploy.
  for (const targetName of ['getgo-dev', 'getgo-staging', 'getgo']) {
    hashViteEnvFiles(digest, join(deploysDir, targetName))
    digest.update(hashFile(join(deploysDir, targetName, 'target.json')) ?? '')
  }

  // prepare:shared refreshes this installed browser dependency before the hash
  // is calculated. Its contents can change without package.json changing when
  // a same-version local archive is refreshed.
  digest.update(hashDir(join(root, 'node_modules', '@tnp', 'getgo-logics')) ?? '')

  // vite.config.ts reads these values from GetGo Tools and embeds them in the
  // browser bundle. Hash only the Firebase build inputs, rather than the whole
  // private .env file, so unrelated Tools settings do not force a Web rebuild.
  for (const environmentPrefix of ['DEVELOPMENT', 'STAGING', 'PRODUCTION']) {
    for (const suffix of ['API_KEY', 'PROJECT_ID', 'PROJECT_NUMBER']) {
      const key = `GETGO_FIREBASE_${environmentPrefix}_${suffix}`
      digest.update(key)
      digest.update(process.env[key] || toolsEnv[key] || '')
    }
  }
  return digest.digest('hex')
}

function hashFirebaseInputs() {
  const digest = createHash('sha256')
  const localBackendRoot = join(logicsRoot, 'firebase-backend')
  const backendRoot = existsSync(localBackendRoot)
    ? localBackendRoot
    : join(root, 'node_modules', '@tnp', 'getgo-logics', 'firebase-backend')
  digest.update(hashDir(join(backendRoot, 'functions', 'shared')) ?? '')
  for (const app of config.apps) {
    digest.update(hashDir(join(backendRoot, 'functions', app)) ?? '')
    digest.update(hashFile(join(backendRoot, 'indexes', `${app}.firestore.indexes.json`)) ?? '')
  }
  digest.update(hashDir(join(logicsRoot, 'firebase-rules', 'generated')) ?? '')
  for (const relativePath of ['package.json', 'package-lock.json', 'tsconfig.json'])
    digest.update(hashFile(join(functionsTemplateDir, relativePath)) ?? '')
  digest.update(hashDir(join(root, 'vendor')) ?? '')
  digest.update(hashFile(join(deploysDir, target, 'target.json')) ?? '')
  return digest.digest('hex')
}

function getStoredHashes(targetName) {
  const stateRoot = join(toolsRoot, '.state')
  const p = join(stateRoot, 'deployments', `${targetName}.json`)
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf-8')) : {}
}

function saveHashes(targetName, hashes) {
  const stateRoot = join(toolsRoot, '.state')
  const directory = join(stateRoot, 'deployments')
  mkdirSync(directory, { recursive: true })
  const p = join(directory, `${targetName}.json`)
  writeFileSync(p, JSON.stringify(hashes, null, 2) + '\n', 'utf-8')
  console.log(`\n  💾  Saved deploy hashes for: ${Object.keys(hashes).join(', ')}`)
}

// ── Parse args ────────────────────────────────────────────────────────────────

const args      = rawArgs
const target    = args.find(a => !a.startsWith('--'))
const force       = args.includes('--force')
const buildOnly   = args.includes('--build-only')
const noLint      = args.includes('--no-lint')
const noTypecheck = args.includes('--no-typecheck')
const scopeArg    = args.find(arg => arg.startsWith('--scope='))
const deployScope = scopeArg?.slice('--scope='.length) ?? 'all'
if (!['all', 'firebase', 'web'].includes(deployScope)) {
  fail(`Invalid deployment scope "${deployScope}". Use firebase or web.`)
}
if (buildOnly && deployOnly) fail('Use either --build-only or --deploy-only, not both.')
const firebaseOnlyScope = deployScope === 'firebase'
const webOnly   = deployScope === 'web'

// ── Validate target ───────────────────────────────────────────────────────────

if (!target) {
  console.error([
    '',
    'Usage: node scripts/deployment/deploy-web.mjs <target> [options]',
    '',
    'Targets:',
    '  getgo    GetGo student learning platform',
    '  hayhay   HayHay company management',
    '',
    'Options:',
    '  --force        Deploy everything regardless of what changed',
    '  --build-only   Check + build but skip Firebase deploy',
    '  --no-lint      Skip ESLint',
    '',
  ].join('\n'))
  process.exit(1)
}

const config = allTargets[target]

if (!config) {
  fail(`Unknown target "${target}". Available: ${Object.keys(allTargets).join(', ')}`)
}

const {
  firebaseProject,
  firebaseConfig,
  buildMode,
  envFile,
  url,
  firebaseOnly = false,
  skipHosting = false,
  buildFunctionsOnly = false,
  devFunctionsDir = null,
  functionsFirebaseConfig = null,
  functionsArtifactsLocation = 'asia-southeast1',
  functionsArtifactsLocations = [functionsArtifactsLocation],
  functionsArtifactsRetentionDays = 1,
  functionCodebases = [],
  functionsRegion = 'us-central1',
  resourceDir = `configs/deploys/${target}`,
} = config
const deployDir = resolveDeploymentPath(resourceDir)
const functionsTemplateDir = join(logicsRoot, 'firebase-backend', 'functions-template')
const storedHashes = force ? {} : getStoredHashes(target)
const toolsEnvPath = join(toolsRoot, '.env')
if (!existsSync(toolsEnvPath)) fail(`Missing GetGo Tools configuration: ${toolsEnvPath}`)
const toolsEnv = loadEnv('getgo-runtime', toolsRoot, '')
if (!deployOnly) {
  const environmentPrefix = target === 'getgo-dev' ? 'DEVELOPMENT' : target === 'getgo-staging' ? 'STAGING' : 'PRODUCTION'
  const toolsFirebaseValues = {
    VITE_FIREBASE_API_KEY: toolsEnv[`GETGO_FIREBASE_${environmentPrefix}_API_KEY`],
    VITE_FIREBASE_PROJECT_ID: toolsEnv[`GETGO_FIREBASE_${environmentPrefix}_PROJECT_ID`],
    VITE_FIREBASE_MESSAGING_SENDER_ID: toolsEnv[`GETGO_FIREBASE_${environmentPrefix}_PROJECT_NUMBER`],
  }
  if (toolsFirebaseValues.VITE_FIREBASE_PROJECT_ID !== firebaseProject) {
    fail(`GetGo Tools Firebase project mismatch for ${target}: expected ${firebaseProject}, received ${toolsFirebaseValues.VITE_FIREBASE_PROJECT_ID || 'empty'}.`)
  }
  for (const [key, value] of Object.entries(toolsFirebaseValues)) {
    if (!value) fail(`GetGo Tools is missing ${key} for ${target}.`)
    process.env[key] = value
  }
  console.log('  🔐 Loaded Firebase target configuration from GetGo Tools.')
  // A Firebase-only run can prove a no-op directly from canonical source
  // inputs. Do this before prepare:shared, cloud checks, source assembly, and
  // per-export TypeScript analysis; those steps are required only when the
  // deployable Firebase inputs changed.
  if (firebaseOnlyScope && !buildOnly && !force) {
    const firebaseInputHash = hashFirebaseInputs()
    if (storedHashes['firebase:inputs'] === firebaseInputHash) {
      console.log('  ⚡ Firebase source inputs match the last successful deployment.')
      console.log('  ⚡ Everything is already up to date. No preparation or cloud deployment is needed.\n')
      console.log(`GETGO_DEPLOY_RESULT ${JSON.stringify({ outcome: 'up-to-date', deployed: [] })}`)
      process.exit(0)
    }
  }
  run(
    'npm run prepare:shared',
    '🧩 Generating shared Firebase dependencies…',
  )
}
// skipHosting: skip vite build + hosting deploy (but still build + deploy functions)
// devFunctionsDir: use an external functions dir instead of deployDir/functions
const functionsDependencyCacheDir = join(toolsRoot, '.state', 'functions-dependencies')
const sharedFunctionsNodeModules = join(functionsDependencyCacheDir, 'node_modules')
const effectiveFunctionsDir = devFunctionsDir ? resolveDeploymentPath(devFunctionsDir) : join(deployDir, 'functions')
const effectiveFunctionCodebases = functionCodebases.length > 0
  ? functionCodebases.map(({ id, name, requiredSecrets = [] }) => ({
      id,
      name,
      requiredSecrets,
      dir: `${effectiveFunctionsDir}-${id}`,
    }))
  : [{ id: null, name: null, requiredSecrets: config.requiredSecrets ?? [], dir: effectiveFunctionsDir }]
const requiredFunctionSecrets = [...new Set(effectiveFunctionCodebases.flatMap(codebase => codebase.requiredSecrets))]
let missingFunctionSecrets = []

if (!deployOnly) assembleFirebaseConfig(target)

// ── Validate config — detect unfilled placeholders ────────────────────────────

function validateConfig() {
  const errors = []

  // ── target.json checks ───────────────────────────────────────────────────
  if (/YOUR-/i.test(url)) {
    errors.push(
      `target.json → "url" is still a placeholder: ${url}\n` +
      `  Set it to your real Firebase Hosting URL (e.g. https://my-project.web.app)`
    )
  }
  if (/^\s*(default|YOUR[_-])/i.test(firebaseProject) && target !== 'portal') {
    errors.push(
      `target.json → "firebaseProject" looks like a placeholder: "${firebaseProject}"\n` +
      `  Set it to your real Firebase project ID. Run: firebase projects:list`
    )
  }

  // ── .env file checks ─────────────────────────────────────────────────────
  if (existsSync(resolveDeploymentPath(envFile))) {
    const envContent = readFileSync(resolveDeploymentPath(envFile), 'utf-8')
    const PLACEHOLDER_PATTERNS = [
      /your-\S+/i,          // your-portal-api-key, your-app-id, …
      /YOUR_\w+/,           // YOUR_API_KEY style
      /^(\d)\1{5,}/m,       // 111111… or 000000… repeated digit runs
      /123456/,             // dead-giveaway placeholder numbers
      /1:123456789:web:/,   // full placeholder app ID
      /abcdef/i,            // common placeholder hex suffix
    ]

    const envLines = envContent.split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#'))
    for (const line of envLines) {
      const [rawKey, ...rest] = line.split('=')
      const key = rawKey.trim()
      const val = rest.join('=').trim()
      if (!val) continue
      for (const pat of PLACEHOLDER_PATTERNS) {
        if (pat.test(val)) {
          errors.push(
            `${envFile} → "${key}" still contains a placeholder value: "${val}"\n` +
            `  Replace it with the real value from the Firebase console.`
          )
          break  // one error per key is enough
        }
      }
    }
  } // env file checks (skipped if file absent — will fail before build step)

  if (errors.length > 0) {
    console.error('\n❌  Config validation failed — unfilled placeholders detected:\n')
    for (const e of errors) console.error(`  • ${e}\n`)
    process.exit(1)
  }
}

validateConfig()

// Normal runs validate through prepare:shared. Deploy-only skips preparation,
// so it must still pass the same local contract gate before Firebase is called.
if (deployOnly) {
  run(
    `node "${toSlash(join(toolsRoot, 'scripts', 'deployment', 'check-getgo-callable-contracts.mjs'))}" ${target}`,
    '🔗 Validating GetGo callable contracts…',
  )
}

// ── Assemble all generated outputs (always runs, no env needed) ──────────────
// ── Assemble Firestore files ───────────────────────────────────────────────────
// Always regenerates configs/deploys/<target>/firestore.rules and
// firestore.indexes.json from canonical @tnp/getgo-logics backend sources.
//
// Rules:   _shared/header + users (always) + each app in config.apps + _shared/footer
// Indexes: merged indexes[] + fieldOverrides[] from each app in config.apps

// ── Functions source assembly ────────────────────────────────────────────────
// Mirrors assembleFirestoreFiles(): copies per-app Function sources from
// @tnp/getgo-logics/firebase-backend plus its shared Functions into
// configs/deploys/{target}/functions/src/, then generates src/index.ts
// from each app's _exports.json.
//
// Files/dirs whose names start with '_' are meta files and are skipped.

const GENERATED_BANNER = (canonicalPath) =>
  `/**\n` +
  ` * ⚠️  GENERATED FILE — DO NOT EDIT DIRECTLY.\n` +
  ` *\n` +
  ` * This file is assembled by GetGo Tools from the canonical source:\n` +
  ` *   ${canonicalPath}\n` +
  ` *\n` +
  ` * Any changes made here will be overwritten on the next deploy.\n` +
  ` * Make your edits in the canonical source file listed above.\n` +
  ` */\n\n`

function copyDirContents(from, to) {
  mkdirSync(to, { recursive: true })
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    if (entry.name.startsWith('_')) continue  // skip _exports.json, _index-header.ts, etc.
    const srcPath  = join(from, entry.name)
    const destPath = join(to,   entry.name)
    if (entry.isDirectory()) {
      copyDirContents(srcPath, destPath)
    } else if (entry.name.endsWith('.ts')) {
    const canonicalPath = relative(root, srcPath)
      const content = readFileSync(srcPath, 'utf-8')
      const withNewline = content.endsWith('\n') ? content : content + '\n'
      writeFileSync(destPath, GENERATED_BANNER(canonicalPath) + withNewline, 'utf-8')
    } else {
      copyFileSync(srcPath, destPath)
    }
  }
}

function copyFunctionSourceFile(from, sourceRoot, toRoot) {
  const relativePath = from.slice(sourceRoot.length + 1)
  const destPath = join(toRoot, relativePath)
  mkdirSync(dirname(destPath), { recursive: true })
  const canonicalPath = relative(root, from)
  const content = readFileSync(from, 'utf-8')
  writeFileSync(
    destPath,
    GENERATED_BANNER(canonicalPath) + (content.endsWith('\n') ? content : `${content}\n`),
    'utf-8',
  )
}

function functionDependencyInputs() {
  const packagePath = join(functionsTemplateDir, 'package.json')
  const lockPath = join(functionsTemplateDir, 'package-lock.json')
  const manifest = JSON.parse(readFileSync(packagePath, 'utf8'))
  const localArchives = Object.values(manifest.dependencies ?? {})
    .filter(value => typeof value === 'string' && value.startsWith('file:vendor/'))
    .map(value => {
      const archiveName = value.slice('file:vendor/'.length)
      const candidates = [join(root, 'vendor', archiveName), join(functionsTemplateDir, 'vendor', archiveName)]
      const source = candidates.find(existsSync)
      if (!source) fail(`Missing Functions vendored dependency: ${archiveName}`)
      return { archiveName, source }
    })
  const digest = createHash('sha256').update(readFileSync(packagePath)).update(readFileSync(lockPath))
  for (const archive of localArchives) digest.update(archive.archiveName).update(readFileSync(archive.source))
  return { packagePath, lockPath, localArchives, hash: digest.digest('hex') }
}

function ensureSharedFunctionDependencies() {
  const inputs = functionDependencyInputs()
  const markerPath = join(functionsDependencyCacheDir, '.inputs-sha256')
  const installedHash = existsSync(markerPath) ? readFileSync(markerPath, 'utf8').trim() : ''
  if (installedHash === inputs.hash && existsSync(sharedFunctionsNodeModules)) {
    console.log('  ⚡  Reusing shared Cloud Functions dependencies.')
    return
  }
  mkdirSync(functionsDependencyCacheDir, { recursive: true })
  copyFileSync(inputs.packagePath, join(functionsDependencyCacheDir, 'package.json'))
  copyFileSync(inputs.lockPath, join(functionsDependencyCacheDir, 'package-lock.json'))
  const vendorDir = join(functionsDependencyCacheDir, 'vendor')
  rmSync(vendorDir, { recursive: true, force: true })
  mkdirSync(vendorDir, { recursive: true })
  for (const archive of inputs.localArchives) copyFileSync(archive.source, join(vendorDir, archive.archiveName))
  runInDirectory(
    'npm ci --ignore-scripts --no-audit --no-fund',
    'Installing shared locked Cloud Functions dependencies…',
    functionsDependencyCacheDir,
  )
  writeFileSync(markerPath, `${inputs.hash}\n`, 'utf8')
}

function assembleFunctionsSrc() {
  const templateDir = functionsTemplateDir
  if (!existsSync(join(templateDir, 'package.json'))) return

  const localBackendRoot = join(logicsRoot, 'firebase-backend')
  const backendRoot = existsSync(localBackendRoot)
    ? localBackendRoot
    : join(root, 'node_modules', '@tnp', 'getgo-logics', 'firebase-backend')
  const sharedFnsDir = join(backendRoot, 'functions', 'shared')
  const exportBlocks = []

  for (const app of config.apps) {
    const appFnsDir = join(backendRoot, 'functions', app)
    if (!existsSync(appFnsDir)) continue
    const exportsPath = join(appFnsDir, '_exports.json')
    if (existsSync(exportsPath)) {
      const parsed = JSON.parse(readFileSync(exportsPath, 'utf-8'))
      const blocks = Array.isArray(parsed) ? parsed : [parsed]
      exportBlocks.push(...blocks.map(block => ({...block, sourceRoot: appFnsDir})))
    }
  }

  const headerTemplatePath = join(sharedFnsDir, '_index-header.ts')
  const headerTemplate = existsSync(headerTemplatePath)
    ? readFileSync(headerTemplatePath, 'utf-8')
    : [
        '// AUTO-GENERATED',
        'import {initializeApp} from "firebase-admin/app";',
        'import {getFirestore} from "firebase-admin/firestore";',
        'import {setGlobalOptions} from "firebase-functions/v2";',
        'initializeApp();',
        'getFirestore().settings({ignoreUndefinedProperties: true});',
        'setGlobalOptions({maxInstances: 10, region: "asia-southeast1"});',
      ].join('\n')

  for (const codebase of effectiveFunctionCodebases) {
    const functionsDir = codebase.dir
    const srcDir = join(functionsDir, 'src')
    mkdirSync(functionsDir, { recursive: true })
    for (const file of ['package.json', 'package-lock.json', 'tsconfig.json']) {
      copyFileSync(join(templateDir, file), join(functionsDir, file))
    }
    const outputVendorDir = join(functionsDir, 'vendor')
    if (existsSync(outputVendorDir)) rmSync(outputVendorDir, {recursive: true})
    const functionPackage = JSON.parse(readFileSync(join(templateDir, 'package.json'), 'utf8'))
    const localDependencies = Object.values(functionPackage.dependencies ?? {})
      .filter(value => typeof value === 'string' && value.startsWith('file:vendor/'))
    for (const dependency of localDependencies) {
      const archiveName = dependency.slice('file:vendor/'.length)
      const candidates = [join(root, 'vendor', archiveName), join(templateDir, 'vendor', archiveName)]
      const archivePath = candidates.find(existsSync)
      if (!archivePath) fail(`Missing Functions vendored dependency: ${archiveName}`)
      mkdirSync(outputVendorDir, {recursive: true})
      copyFileSync(archivePath, join(outputVendorDir, archiveName))
    }
    const nodeModulesLink = join(functionsDir, 'node_modules')
    rmSync(nodeModulesLink, { recursive: true, force: true })
    symlinkSync(sharedFunctionsNodeModules, nodeModulesLink, 'dir')
    if (existsSync(srcDir)) rmSync(srcDir, { recursive: true })
    mkdirSync(srcDir, { recursive: true })
    const selectedBlocks = exportBlocks.map(block => ({
      ...block,
      exports: block.exports.filter(entry =>
        codebase.id === null || entry.codebase === codebase.id
      ),
    })).filter(block => block.exports.length > 0)

    if (existsSync(sharedFnsDir)) {
      if (codebase.id === null) {
        copyDirContents(sharedFnsDir, srcDir)
      } else {
        const sharedFiles = new Set(
          selectedBlocks.flatMap(block =>
            block.exports.flatMap(entry => entry.sharedFiles ?? [])
          )
        )
        for (const relativePath of sharedFiles) {
          copyFunctionSourceFile(join(sharedFnsDir, relativePath), sharedFnsDir, srcDir)
        }
      }
    }

    for (const block of selectedBlocks) {
      for (const entry of block.exports) {
        if (codebase.id !== null && !Array.isArray(entry.files)) {
          fail(`Function export ${entry.names.join(', ')} is missing its files list.`)
        }
        if (codebase.id === null) {
          copyDirContents(block.sourceRoot, srcDir)
          continue
        }
        for (const relativePath of entry.files) {
          copyFunctionSourceFile(join(block.sourceRoot, relativePath), block.sourceRoot, srcDir)
        }
      }
    }

    const header = headerTemplate
      .replace(/{TARGET}/g, target)
      .replace(/{FUNCTIONS_REGION}/g, functionsRegion)
    writeFileSync(
      join(srcDir, 'deploymentConfig.ts'),
      `${GENERATED_BANNER(`configs/deploys/${target}/target.json`)}export const DEPLOYMENT_REGION = ${JSON.stringify(functionsRegion)};\n`,
      'utf-8',
    )
    const exportSections = selectedBlocks.map(block => {
      const sep = '='.repeat(20)
      return [
        `// ${sep} ${block.section} ${sep}`,
        ...block.exports.map(entry =>
          `export {${entry.names.join(', ')}} from "${entry.from}";`
        ),
      ].join('\n')
    })
    writeFileSync(join(srcDir, 'index.ts'), [header, ...exportSections, ''].join('\n\n'), 'utf-8')
    console.log(`  🔧  Assembled functions-${codebase.id ?? 'default'} (${codebase.name ?? 'default'})`)
  }
}

function assembleFirestoreFiles() {
  mkdirSync(deployDir, { recursive: true })

  const localBackendRoot = join(logicsRoot, 'firebase-backend')
  const backendRoot = existsSync(localBackendRoot)
    ? localBackendRoot
    : join(root, 'node_modules', '@tnp', 'getgo-logics', 'firebase-backend')
  const localRulesSource = join(logicsRoot, 'firebase-rules', 'generated', 'firestore.rules')
  const rulesSource = existsSync(localRulesSource)
    ? localRulesSource
    : join(root, 'node_modules', '@tnp', 'getgo-logics', 'firebase-rules', 'generated', 'firestore.rules')
  if (!existsSync(rulesSource)) {
    fail('Missing @tnp/getgo-logics Firebase rules. Run npm run prepare:shared.')
  }
  const rulesOut = readFileSync(rulesSource, 'utf-8')

  // Keep client query paths and the deployable rules contract aligned. The
  // incremental leaderboard uses a nested collection rather than the legacy
  // aggregate document, so publishing rules without this match makes the
  // rankings page fail even though the rules deploy itself succeeds.
  const requiredRuleMatches = [
    'match /getgo-star-leaderboards/{scope}/starEntries/{entryId}',
  ]
  for (const requiredMatch of requiredRuleMatches) {
    if (!rulesOut.includes(requiredMatch)) {
      fail(`Missing required Firestore rule contract: ${requiredMatch}`)
    }
  }
  const legacyMarker = '// ── Legacy GetGo mobile compatibility'
  const legacyRulesStart = rulesOut.indexOf(legacyMarker)
  if (legacyRulesStart < 0) fail('Missing legacy GetGo Firestore compatibility contract.')
  const legacyRules = rulesOut.slice(legacyRulesStart)
  for (const requiredMatch of [
    'match /getgo-contests/{contestName}',
    'match /getgo-support-threads/{threadId}',
    'match /getgo-support-active/{userId}',
    '!request.resource.data.keys().hasAny(getGoBillingFields())',
  ]) {
    if (!legacyRules.includes(requiredMatch)) {
      fail(`Missing legacy GetGo Firestore rule contract: ${requiredMatch}`)
    }
  }
  writeFileSync(join(deployDir, 'firestore.rules'), rulesOut, 'utf-8')

  // ── Validate: catch undefined function references before deploy ────────────
  // Strip line comments and block comments before analysing, to avoid
  // false positives from words like email() or update() inside comment text.
  const rulesStripped = rulesOut
    .replace(/\/\*[\s\S]*?\*\//g, '')   // block comments
    .replace(/\/\/[^\n]*/g, '')          // line comments
  const definedFns  = new Set([...rulesStripped.matchAll(/\bfunction\s+(\w+)\s*\(/g)].map(m => m[1]))
  // Built-in Firestore Rules functions — not defined by us but always available
  const BUILTIN_FNS = new Set(['get', 'exists', 'getAfter', 'debug'])
  // Language keywords / built-in methods that look like calls but aren't function defs
  const KEYWORDS = new Set(['if', 'return', 'match', 'allow', 'function', 'let', 'in',
    'hasAll', 'hasAny', 'hasOnly', 'keys', 'values', 'size', 'toUtf8', 'toBase64',
    'trim', 'lower', 'upper', 'replace', 'split', 'matches', 'toSet', 'diff',
    'affectedKeys', 'changedKeys', 'addedKeys', 'removedKeys'])
  const calledFns   = new Set(
    [...rulesStripped.matchAll(/\b([a-zA-Z_]\w*)\s*\(/g)]
      .map(m => m[1])
      .filter(n => !KEYWORDS.has(n) && !BUILTIN_FNS.has(n))
  )
  const undefinedFns = [...calledFns].filter(fn => !definedFns.has(fn))
  if (undefinedFns.length > 0) {
    console.error(`\n❌  firestore.rules validation failed — undefined function${undefinedFns.length > 1 ? 's' : ''} called:\n`)
    for (const fn of undefinedFns) {
      console.error(`    ${fn}()  ← called in: @tnp/getgo-logics/firebase-rules`)
    }
    console.error('\n    Fix: define the function or replace the call before deploying.\n')
    process.exit(1)
  }
  // ── Validate: catch nested recursive-wildcard match rules ────────────────
  // Firestore requires match /{path=**}/... rules to sit at the root document
  // level (depth = 1 inside `match /databases/{database}/documents`).
  // Nesting them inside another match block silently breaks the entire parent
  // block — Firebase compiles the file without error but denies auth'd reads.
  {
    const lines = rulesStripped.split('\n')
    let   depth = 0
    let   documentsDepth = -1
    const nestedWildcards = []
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      // detect entry into /databases/{database}/documents
      if (documentsDepth === -1 && /match\s+\/databases\/[^/]+\/documents\s*\{/.test(line)) {
        documentsDepth = depth  // record depth *before* the opening brace
      }
      // count braces
      for (const ch of line) {
        if (ch === '{') depth++
        else if (ch === '}') depth--
      }
      // flag any {path=**} match that is nested more than 1 level inside `documents`
      if (/match\s+\/\{path=\*\*\}/.test(line) && documentsDepth >= 0) {
        const matchDepth = depth  // depth after processing this line's braces
        if (matchDepth > documentsDepth + 2) {
          nestedWildcards.push({ line: i + 1, src: line.trim() })
        }
      }
    }
    if (nestedWildcards.length > 0) {
      console.error(`\n❌  firestore.rules validation failed — nested recursive-wildcard rule(s) detected:\n`)
      for (const { line, src } of nestedWildcards) {
        console.error(`    line ${line}: ${src}`)
      }
      console.error('\n    Fix: move match /{path=**}/... rules to the root document level')
      console.error('    (directly inside match /databases/{database}/documents, not nested in another match block).\n')
      console.error('    Found in: @tnp/getgo-logics/firebase-rules')
      console.error('')
      process.exit(1)
    }
  }
  // ── End validation ─────────────────────────────────────────────────────────

  // Indexes: merge all per-app index files
  const mergedIndexes       = []
  const mergedFieldOverrides = []

  for (const app of config.apps) {
    const idxPath = join(backendRoot, 'indexes', `${app}.firestore.indexes.json`)
    if (!existsSync(idxPath)) continue
    const data = JSON.parse(readFileSync(idxPath, 'utf-8'))
    if (Array.isArray(data.indexes))        mergedIndexes.push(...data.indexes)
    if (Array.isArray(data.fieldOverrides)) mergedFieldOverrides.push(...data.fieldOverrides)
  }

  const requiredIndexes = [
    ['tests', [['status', 'ASCENDING'], ['updatedAt', 'DESCENDING']]],
    ['tests', [['type', 'ASCENDING'], ['status', 'ASCENDING'], ['updatedAt', 'DESCENDING']]],
    ['tests', [['quizId', 'ASCENDING'], ['updatedAt', 'DESCENDING']]],
    ['tests', [['quizId', 'ASCENDING'], ['type', 'ASCENDING'], ['status', 'ASCENDING'], ['updatedAt', 'DESCENDING']]],
    ['tests', [['quizId', 'ASCENDING'], ['type', 'ASCENDING'], ['status', 'ASCENDING'], ['createdAt', 'DESCENDING']]],
    ['starEntries', [['stars', 'DESCENDING'], ['studentName', 'ASCENDING']]],
  ]
  for (const [collectionGroup, fields] of requiredIndexes) {
    const found = mergedIndexes.some(index =>
      index.collectionGroup === collectionGroup
      && index.queryScope === 'COLLECTION'
      && Array.isArray(index.fields)
      && index.fields.length === fields.length
      && fields.every(([fieldPath, order], position) => {
        const field = index.fields[position]
        return field?.fieldPath === fieldPath && field?.order === order
      })
    )
    if (!found) {
      const signature = fields.map(([fieldPath, order]) => `${fieldPath} ${order}`).join(', ')
      fail(`Missing required Firestore index contract: ${collectionGroup}(${signature})`)
    }
  }

  const indexesOut = JSON.stringify(
    { indexes: mergedIndexes, fieldOverrides: mergedFieldOverrides },
    null, 2
  ) + '\n'
  writeFileSync(join(deployDir, 'firestore.indexes.json'), indexesOut, 'utf-8')

  console.log('  🔧  Synced firestore.rules (@tnp/getgo-logics)')
  console.log(`  🔧  Assembled firestore.indexes.json (${mergedIndexes.length} indexes, ${mergedFieldOverrides.length} overrides)`)
}

function assembleStorageRules() {
  const localRulesSource = join(logicsRoot, 'firebase-rules', 'generated', 'storage.rules')
  const rulesSource = existsSync(localRulesSource)
    ? localRulesSource
    : join(root, 'node_modules', '@tnp', 'getgo-logics', 'firebase-rules', 'generated', 'storage.rules')
  if (!existsSync(rulesSource)) {
    fail('Missing @tnp/getgo-logics Firebase Storage rules. Run npm run prepare:shared.')
  }
  const rulesOut = readFileSync(rulesSource, 'utf-8')
  const legacyMarker = '// ── Legacy GetGo mobile compatibility'
  const legacyRulesStart = rulesOut.indexOf(legacyMarker)
  if (legacyRulesStart < 0) fail('Missing legacy GetGo Storage compatibility contract.')
  const legacyRules = rulesOut.slice(legacyRulesStart)
  for (const requiredMatch of [
    'match /getgo-quizzes/{allPaths=**}',
    'match /getgo-practices/{allPaths=**}',
    'match /getgo-sources/{allPaths=**}',
    'match /quizzes/{allPaths=**}',
    'match /getgo-support/{uid}/{threadId}/{fileName}',
  ]) {
    if (!legacyRules.includes(requiredMatch)) {
      fail(`Missing legacy GetGo Storage rule contract: ${requiredMatch}`)
    }
  }
  writeFileSync(join(deployDir, 'storage.rules'), rulesOut, 'utf-8')
  console.log('  🔧  Synced storage.rules (@tnp/getgo-logics)')
}

function runFirebaseRulesCompatibilityTests() {
  if (target === 'getgo-dev' || webOnly || deployOnly) return
  const packagePath = join(logicsRoot, 'package.json')
  if (!existsSync(packagePath)) {
    fail(`GetGo Logics repository was not found at ${logicsRoot}; Firebase rules compatibility tests cannot run.`)
  }
  runInDirectory(
    'npm run test:firebase-rules',
    '🛡️  Running Firebase rules compatibility tests…',
    logicsRoot,
  )
  console.log('  ✅ Firebase rules compatibility tests passed.')
}

if (!deployOnly) {
  if (!webOnly) {
    assembleFirestoreFiles()
    assembleStorageRules()
    runFirebaseRulesCompatibilityTests()
  }
  if (!webOnly) assembleFunctionsSrc()
}
if (!webOnly && existsSync(join(functionsTemplateDir, 'package.json'))) ensureSharedFunctionDependencies()

// ── Guard: env file must exist to lint/build/deploy ─────────────────────────

const envPath = resolveDeploymentPath(envFile)
if (!existsSync(envPath)) {
  fail(
    `Missing env file: ${envFile}\n` +
    `  Copy the example and fill in your Firebase credentials:\n` +
    `  cp ${envFile}.example ${envFile}`
  )
}
const requiredFirebaseEnv = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID']
const deployEnv = {
  ...Object.fromEntries(
  readFileSync(envPath, 'utf8').split(/\r?\n/)
    .filter(line => line && !line.trimStart().startsWith('#') && line.includes('='))
    .map(line => {
      const separator = line.indexOf('=')
      return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()]
    })),
  VITE_FIREBASE_API_KEY: process.env.VITE_FIREBASE_API_KEY,
  VITE_FIREBASE_PROJECT_ID: process.env.VITE_FIREBASE_PROJECT_ID,
  VITE_FIREBASE_MESSAGING_SENDER_ID: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
}
const missingFirebaseEnv = requiredFirebaseEnv.filter(key => !deployEnv[key])
if (!deployOnly && !webOnly && missingFirebaseEnv.length > 0) {
  fail(`${envFile} is missing required Firebase Web configuration: ${missingFirebaseEnv.join(', ')}`)
}

// ── Config guard snapshot (before anything runs) ──────────────────────────────

const _guardBefore = guardSnapshot()
// Safety net: always restore config files on exit, regardless of how the process
// exits (normal exit, process.exit(), or unhandled exception). Idempotent.
process.on('exit', () => guardRestore(_guardBefore))


const hasStorageRules = existsSync(
  join(root, 'node_modules', '@tnp', 'getgo-logics', 'firebase-rules', 'generated', 'storage.rules')
)
const hasFunctions = existsSync(join(functionsTemplateDir, 'package.json'))

// ── Print plan (pre-build) ────────────────────────────────────────────────────

console.log([
  '',
  buildOnly ? `🎯  Build source : ${target}` : `🎯  Target      : ${target}`,
  `📦  Apps        : ${config.apps.join(', ')}`,
  buildOnly ? `🔥  Firebase    : no deployment` : `🔥  Firebase    : ${firebaseProject}`,
  buildOnly ? `⚙️   Configs     : staging + production` : `🌐  URL         : ${url}`,
  (firebaseOnly || skipHosting) ? `🔧  Mode        : skip-hosting (functions + rules only)` : '',
  buildFunctionsOnly          ? `🔧  Functions   : build-only (not deployed to production)` : '',,
  buildOnly
    ? `🔎  Mode        : immutable artifact build (no Firebase deploy)`
    : '',
  force ? buildOnly
    ? `  ⚠️   --force: rebuilding all resources.`
    : `  ⚠️   --force: deploying all resources.` : '',
  '',
].filter(s => s !== undefined).join('\n'))

releaseProgress(0, 'Checking cloud prerequisites')

// Storage rules may call Firestore. Ensure the required service-agent binding
// before linting or building so missing IAM never wastes a complete Web build.
if (!buildOnly && !webOnly) {
  const preflightFingerprint = createHash('sha256')
    .update(firebaseProject)
    .update(existsSync(join(deployDir, 'storage.rules')) ? readFileSync(join(deployDir, 'storage.rules')) : '')
    .update(requiredFunctionSecrets.slice().sort().join('\n'))
    .digest('hex')
  const cachedPreflight = readPreflightCache(firebaseProject, preflightFingerprint)
  if (cachedPreflight) {
    missingFunctionSecrets = cachedPreflight.missingSecrets ?? []
    console.log(`  ⚡ Reusing cloud prerequisite checks from the last ${PREFLIGHT_CACHE_MS / 60_000} minutes.`)
  } else {
    configureStorageFirestoreRulesIam(firebaseProject, join(deployDir, 'storage.rules'))
    if (hasFunctions) configureGoogleCloudService(firebaseProject, 'secretmanager.googleapis.com')
    if (hasFunctions) missingFunctionSecrets = findMissingRequiredSecrets(firebaseProject, requiredFunctionSecrets)
    // Do not cache a missing-secret result: a newly created secret must be
    // recognized immediately on the next deploy attempt.
    if (missingFunctionSecrets.length === 0)
      writePreflightCache(firebaseProject, preflightFingerprint, missingFunctionSecrets)
  }
}
releaseProgress(1, 'Cloud prerequisites ready')

// ── Lint ──────────────────────────────────────────────────────────────────────


let lintPassed = true
const lintOutputFile = join(tmpdir(), 'eslint-output.txt')

if (!noLint && !firebaseOnly && !skipHosting && !firebaseOnlyScope) {
  console.log('\n  🔍 Linting…')
  console.log(`  $ npx eslint . (output → ${lintOutputFile})\n`)
  try {
    const out = execSync('npx eslint .', { encoding: 'utf-8', cwd: root, stdio: ['pipe', 'pipe', 'pipe'] })
    writeFileSync(lintOutputFile, out || '(no output)')
    console.log(`  ✅ ESLint passed. Full output: ${lintOutputFile}`)
  } catch (e) {
    const combined = (e.stdout || '') + (e.stderr || '')
    writeFileSync(lintOutputFile, combined)
    const summary = combined.match(/✖ .+/)?.[0] ?? 'ESLint failed'
    console.error(`  ❌ ESLint FAILED — ${summary}`)
    console.error(`  Full output written to: ${lintOutputFile}`)
    lintPassed = false
  }
}

// ── TypeScript check ──────────────────────────────────────────────────────────

if (!noTypecheck && !firebaseOnly && !skipHosting && !firebaseOnlyScope) {
  try {
    run(
      `node -e "const fs=require('fs'),p='tsconfig.app.json',o=fs.readFileSync(p,'utf8');` +
      `const {execSync}=require('child_process');` +
      `let next=o;` +
      `const v=execSync('npx tsc --version',{encoding:'utf8'}).trim().match(/Version\\s+(\\d+)/);` +
      `const major=v?Number(v[1]):0;` +
      `if(major>0&&major<6)next=o.replace('\\"6.0\\"','\\"5.0\\"');` +
      `fs.writeFileSync(p,next);` +
      `try{const r=execSync('npx tsc --project tsconfig.app.json --noEmit 2>&1',{encoding:'utf8'});` +
      `const filtered=r.split('\\n').filter(l=>!l.includes('TS5101')).join('\\n');` +
      `if(filtered.trim())throw new Error(filtered);}` +
      `catch(e){const out=(e.stdout||e.message||'').split('\\n').filter(l=>!l.includes('TS5101')).join('\\n');if(out.trim()){process.stderr.write(out);process.exitCode=1;}}` +
      `finally{fs.writeFileSync(p,o);}"`,
      '🔬 Type-checking…'
    )
  } catch (e) {
    const out = e.stdout?.toString() || e.message || ''
    console.error('  ❌ TypeScript errors found:')
    console.error(out)
    console.warn('  ⚠️  TypeScript errors found in functions — continuing deploy (warnings only).')
  }
}
releaseProgress(2, 'Code checks complete')

// ── Build ────────────────────────────────────────────────────────────────────
// Build hosting only when its source inputs changed. Vite intentionally embeds
// a build timestamp, so rebuilding first would make identical source appear
// changed and force an unnecessary hosting deployment.

const hostingInputHash = hashHostingInputs()
const shouldBuildHosting =
  !firebaseOnly && !skipHosting && !firebaseOnlyScope && !deployOnly &&
  (force ||
    hostingInputHash !== storedHashes['hosting:inputs'] ||
    !existsSync(join(root, 'dist', 'index.html')))
if (shouldBuildHosting) {
  run('npx vite build --mode getgo', '📦 Building shared GetGo Web artifact…')
} else if (!firebaseOnly && !skipHosting && !firebaseOnlyScope && !deployOnly) {
  console.log('\n  ⏭️  Web build inputs unchanged; reusing the existing dist artifact.')
}
releaseProgress(3, 'Web artifact ready')

// ── Deploy ────────────────────────────────────────────────────────────────────

// ── Compute content hashes & determine what to deploy ───────────────────────
// Done here (after build) so dist/ exists for the hosting hash.

const currentHashes = {}
const currentFunctionHashes = new Map()
const legacyFunctionCodebaseHashes = new Map()

if (!firebaseOnly && !skipHosting && !firebaseOnlyScope) {
  currentHashes['hosting'] = hashDir(join(root, 'dist'))
  currentHashes['hosting:inputs'] = hostingInputHash
  currentHashes['hosting:config'] = hashFile(resolveDeploymentPath(firebaseConfig))
}
currentHashes['firestore:rules']   = hashFile(join(deployDir, 'firestore.rules'))
currentHashes['firestore:indexes'] = hashFile(join(deployDir, 'firestore.indexes.json'))
currentHashes['firebase:inputs'] = hashFirebaseInputs()
if (hasStorageRules) {
  currentHashes['storage'] = hashFile(join(deployDir, 'storage.rules'))
}
if (hasFunctions) {
  for (const codebase of effectiveFunctionCodebases) {
    const legacyDigest = createHash('sha256')
    legacyDigest.update(hashDir(join(codebase.dir, 'src')))
    legacyDigest.update(hashFile(join(codebase.dir, 'package.json')))
    legacyDigest.update(hashFile(join(codebase.dir, 'package-lock.json')))
    legacyDigest.update(hashDir(join(codebase.dir, 'vendor')))
    legacyFunctionCodebaseHashes.set(codebase, legacyDigest.digest('hex'))
    for (const [name, hash] of functionDeployHashes(codebase.dir)) {
      const key = `functions:${codebase.name ?? 'default'}:${name}`
      currentHashes[key] = hash
      currentFunctionHashes.set(key, { codebase, name, hash })
    }
  }
}

let migratedFunctionHashes = false
for (const codebase of effectiveFunctionCodebases) {
  const codebaseName = codebase.name ?? 'default'
  const codebaseKey = `functions:${codebaseName}`
  const prefix = `${codebaseKey}:`
  if (storedHashes[codebaseKey] !== legacyFunctionCodebaseHashes.get(codebase)) continue
  for (const [key, value] of currentFunctionHashes) if (value.codebase === codebase) storedHashes[key] = value.hash
  delete storedHashes[codebaseKey]
  migratedFunctionHashes = true
}

function hashChanged(key) {
  if (force) return true
  return currentHashes[key] !== storedHashes[key]
}

const willDeployHosting   = !firebaseOnlyScope && !firebaseOnly && !skipHosting &&
  (hashChanged('hosting') || hashChanged('hosting:config'))
const willDeployRules     = !webOnly && hashChanged('firestore:rules')
const willDeployIndexes   = !webOnly && hashChanged('firestore:indexes')
const willDeployStorage   = !webOnly && hasStorageRules && hashChanged('storage')
// buildFunctionsOnly: assemble + compile but never deploy functions to production
const skippedFunctionCodebases = !webOnly && hasFunctions && !buildFunctionsOnly
  ? effectiveFunctionCodebases.filter(codebase =>
      [...currentFunctionHashes.entries()].some(([key, value]) => value.codebase === codebase && hashChanged(key)) &&
      codebase.requiredSecrets.some(secret => missingFunctionSecrets.includes(secret))
    )
  : []
// PRODUCT INVARIANT: a missing secret for one optional Function codebase is a
// non-blocking warning. Skip only that codebase and continue deploying every
// other changed resource. Do not turn this into a release-wide failure; report
// the final outcome as "warning" so the UI never claims a clean deployment.
const changedFunctionCodebases = !webOnly && hasFunctions && !buildFunctionsOnly
  ? effectiveFunctionCodebases.filter(codebase =>
      (force || [...currentFunctionHashes.entries()].some(([key, value]) => value.codebase === codebase && hashChanged(key)) ||
        Object.keys(storedHashes).some(key => key.startsWith(`functions:${codebase.name ?? 'default'}:`) && !currentFunctionHashes.has(key))) &&
      !skippedFunctionCodebases.includes(codebase)
    )
  : []
const functionCodebasesRequiringFullDeploy = new Set(changedFunctionCodebases.filter(codebase => {
  if (force) return true
  const prefix = `functions:${codebase.name ?? 'default'}:`
  return Object.keys(storedHashes).some(key => key.startsWith(prefix) && !currentFunctionHashes.has(key))
}))
const changedFunctions = changedFunctionCodebases.flatMap(codebase => {
  if (functionCodebasesRequiringFullDeploy.has(codebase)) return []
  const codebaseName = codebase.name ?? 'default'
  const prefix = `functions:${codebaseName}:`
  const hasStoredFunctionHashes = Object.keys(storedHashes).some(key => key.startsWith(prefix))
  return [...currentFunctionHashes.entries()]
    .filter(([key, value]) => value.codebase === codebase && (!hasStoredFunctionHashes || hashChanged(key)))
    .map(([key, value]) => ({ ...value, key, target: `${prefix}${value.name}` }))
})
const changedFunctionTargets = [
  ...[...functionCodebasesRequiringFullDeploy].map(codebase => `functions:${codebase.name ?? 'default'}`),
  ...changedFunctions.map(item => item.target),
]
const willDeployFunctions = changedFunctionTargets.length > 0

const deployTargets = [
  willDeployHosting   && 'hosting',
  willDeployRules     && 'firestore:rules',
  willDeployIndexes   && 'firestore:indexes',
  willDeployStorage   && 'storage',
  ...changedFunctionTargets,
].filter(Boolean)
releaseProgress(4, 'Deployment plan ready')

// ── Print resource deployment plan ───────────────────────────────────────────

const mark = (present, ch) =>
  !present    ? '─  not present'
  : ch        ? '✅ changed'
  :             '⏭️  no changes'

const resourceLabel = buildOnly ? 'Resources (would be deployed):' : 'Resources to deploy:'

console.log([
  `  ${resourceLabel}`,
  `    Hosting            ${mark(!firebaseOnly && !skipHosting, willDeployHosting)}`,
  `    Firestore rules    ${mark(true, willDeployRules)}`,
  `    Firestore indexes  ${mark(true, willDeployIndexes)}`,
  `    Storage rules      ${mark(hasStorageRules, willDeployStorage)}`,
  `    Functions          ${buildFunctionsOnly && hasFunctions ? '🔨 build-only (not deployed)' : mark(hasFunctions, willDeployFunctions)}`,
  ...effectiveFunctionCodebases.map(codebase =>
    `      ${codebase.name ?? 'default'} ${skippedFunctionCodebases.includes(codebase) ? '⚠️  skipped (missing secret)' : mark(true, changedFunctionCodebases.includes(codebase))}`
  ),
  ...changedFunctions.map(item => `        ${item.name} ✅ changed`),
  ...[...functionCodebasesRequiringFullDeploy].map(codebase => `        ${codebase.name ?? 'default'} ✅ full codebase deployment${force ? ' (--force)' : ' (exports removed)'}`),
  '',
].join('\n'))

if (!buildOnly && deployTargets.length === 0 && !(buildFunctionsOnly && hasFunctions)) {
  if (!webOnly && skippedFunctionCodebases.length === 0) {
    storedHashes['firebase:inputs'] = currentHashes['firebase:inputs']
  }
  if (migratedFunctionHashes || (!webOnly && skippedFunctionCodebases.length === 0)) saveHashes(target, storedHashes)
  console.log(skippedFunctionCodebases.length > 0
    ? '  ⚠️  All deployable resources are up to date. Secret-dependent Functions remain skipped.\n'
    : '  ⚡  Everything is already up to date. No resources need deployment.\n')
  console.log(`GETGO_DEPLOY_RESULT ${JSON.stringify({
    outcome: skippedFunctionCodebases.length > 0 ? 'warning' : 'up-to-date',
    deployed: [],
  })}`)
  guardRestore(_guardBefore)
  process.exit(0)
}

// Warn on lint failure but continue deploy (build-only mode reports at the end instead)
if (!buildOnly && !lintPassed) {
  console.warn(`\n⚠️  ESLint errors found — continuing deploy (warnings only).`)
  console.warn(`    See: ${lintOutputFile}\n`)
}

// Build functions if deploying them, or if buildFunctionsOnly / buildOnly (build for local emulator or dev)
if (willDeployFunctions || (!webOnly && (buildFunctionsOnly || (buildOnly && hasFunctions)))) {
  const codebasesToBuild = buildFunctionsOnly
    ? effectiveFunctionCodebases
    : changedFunctionCodebases
  for (const codebase of codebasesToBuild) {
    const codebaseName = codebase.name ?? 'default'
    try {
      releaseProgress(4, `Building functions: ${codebaseName}`)
      const buildInfo = join(tmpdir(), `getgo-functions-${createHash('sha256').update(codebase.dir).digest('hex').slice(0, 12)}.tsbuildinfo`)
      run(
        `npx tsc --project "${toSlash(join(codebase.dir, 'tsconfig.json'))}" --incremental --tsBuildInfoFile "${toSlash(buildInfo)}"`,
        `🔨 Building functions: ${codebaseName}…`,
      )
    } catch (err) {
      fail(`Cloud Functions build failed for ${codebaseName}. Fix TypeScript errors and retry.`)
    }
  }
}
releaseProgress(5, 'Build artifacts ready')

if (!buildOnly && (deployTargets.length > 0 || (buildFunctionsOnly && hasFunctions))) {
  try {
  const forceFlag = force ? ' --force' : ''
  // Firebase requires --force to delete deployed functions that no longer
  // exist locally. Deploy jobs are non-interactive, so function deployments
  // must explicitly authorize that cleanup. This does not change which
  // resources our hash-based planner selected for deployment.
  const migratingLegacyCodebase = willDeployFunctions && storedHashes.functions !== undefined
  const functionDeletionFlag = migratingLegacyCodebase || functionCodebasesRequiringFullDeploy.size > 0 || force ? ' --force' : ''
  const functionsOnlyTarget = migratingLegacyCodebase
    ? 'functions'
    : changedFunctionTargets.join(',')
  const exportedFunctionNames = codebases => codebases.flatMap(codebase => {
    const indexPath = join(codebase.dir, 'src', 'index.ts')
    if (!existsSync(indexPath)) return []
    return [...readFileSync(indexPath, 'utf8').matchAll(/export\s+\{([^}]+)\}/g)]
      .flatMap(match => match[1].split(',').map(name => name.trim()).filter(Boolean))
  })
  const skippedFunctionNames = new Set(exportedFunctionNames(skippedFunctionCodebases))
  const deployedFunctionNames = new Set(exportedFunctionNames(changedFunctionCodebases))
  const fatalWarnings = [
    {
      pattern: /Unable to find a valid endpoint for function\s+[`'"]?([A-Za-z0-9_-]+)/g,
      message: '❌  Hosting rewrite points to a function that is not exported/deployed',
      ignoreDetails: skippedFunctionNames,
    },
  ]

  // Deploy functions separately so Firebase receives only the changed
  // codebases. Rules, indexes, storage, and hosting remain independent.
  if (willDeployFunctions) {
    const selectedFunctionsConfig = resolveDeploymentPath(functionsFirebaseConfig ?? firebaseConfig)
    const deployFunctionsCommand = `firebase deploy --project ${firebaseProject} --config "${toSlash(selectedFunctionsConfig)}" --only ${functionsOnlyTarget}${functionDeletionFlag}`
    try {
      runChecked(deployFunctionsCommand, `🚀 Deploying: ${functionsOnlyTarget}…`, fatalWarnings)
    } catch (error) {
      const output = typeof error?.output === 'string' ? error.output : ''
      const incompatibleTriggers = [...output.matchAll(
        /Error: \[[^:\]]+:([A-Za-z0-9_-]+)\(([^)]+)\)\] Changing from an? .+ function to an? .+ function is not allowed\./g
      )].map(match => ({name: match[1], region: match[2]}))
      if (incompatibleTriggers.length === 0 || incompatibleTriggers.some(({name}) => !deployedFunctionNames.has(name))) throw error
      console.warn('\n⚠️  Recreating Functions whose trigger type changed:')
      for (const {name, region} of incompatibleTriggers) {
        console.warn(`    ${name} (${region})`)
        run(
          `firebase functions:delete ${name} --region ${region} --project ${firebaseProject} --force`,
          `♻️  Removing incompatible trigger for ${name}…`,
        )
      }
      runChecked(deployFunctionsCommand, `🚀 Retrying Functions with the corrected trigger types…`, fatalWarnings)
    }
  }
  releaseProgress(6, 'Deploying remaining Firebase resources')

  const nonFunctionTargets = willDeployFunctions
    ? deployTargets.filter(t => !t.startsWith('functions:'))
    : deployTargets

  if (nonFunctionTargets.length > 0) {
    const only = nonFunctionTargets.join(',')
    runChecked(
      `firebase deploy --project ${firebaseProject} --config "${toSlash(resolveDeploymentPath(firebaseConfig))}" --public "${toSlash(join(root, 'dist'))}" --only ${only}${nonFunctionTargets.includes('functions') ? functionDeletionFlag : forceFlag}`,
      `🚀 Deploying: ${only}…`,
      fatalWarnings
    )
  }

  // Save hashes for only the resources that were successfully deployed
  const newHashes = { ...storedHashes }
  if (migratingLegacyCodebase) delete newHashes.functions
  for (const key of deployTargets) {
    if (currentHashes[key] !== undefined) newHashes[key] = currentHashes[key]
  }
  for (const codebase of changedFunctionCodebases) {
    const codebaseKey = `functions:${codebase.name ?? 'default'}`
    const prefix = `${codebaseKey}:`
    for (const key of Object.keys(newHashes)) if (key.startsWith(prefix)) delete newHashes[key]
    for (const [key, value] of currentFunctionHashes) if (value.codebase === codebase) newHashes[key] = value.hash
    delete newHashes[codebaseKey]
  }
  if (willDeployHosting) newHashes['hosting:inputs'] = currentHashes['hosting:inputs']
  if (willDeployHosting) newHashes['hosting:config'] = currentHashes['hosting:config']
  if (!webOnly && deployTargets.length > 0 && skippedFunctionCodebases.length === 0) newHashes['firebase:inputs'] = currentHashes['firebase:inputs']
  saveHashes(target, newHashes)
  console.log(`GETGO_DEPLOY_RESULT ${JSON.stringify({
    outcome: skippedFunctionCodebases.length > 0 ? 'warning' : 'deployed',
    deployed: deployTargets,
  })}`)
  console.log(`\n✅  Live at: ${url}\n`)
  } finally {
    // Always restore config files even if deploy throws
    guardRestore(_guardBefore)
  }
}

if (!buildOnly) releaseProgress(7, 'Web and Firebase deployment complete')

if (buildOnly) {
  if (lintPassed) {
    console.log([
      '',
      '✅  Immutable artifact inputs built successfully.',
      '    No Firebase resources were deployed.',
      '',
    ].filter(s => s !== undefined).join('\n'))
  } else {
    console.error([
      '',
      '❌  Build-check FAILED.',
      `    ESLint errors found — see: ${lintOutputFile}`,
      `    TypeScript and Vite build completed (lint errors do not block them here).`,
      '',
    ].join('\n'))
    process.exitCode = 1
  }
}

// ── Restore any config files the pipeline touched ────────────────────────────
// (also called inside the deploy try/finally above; this handles the buildOnly path)

if (buildOnly) guardRestore(_guardBefore)
