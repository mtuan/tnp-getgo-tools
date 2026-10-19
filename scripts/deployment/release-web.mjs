#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  rmSync, statSync, writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { createRootFirebaseConfig, planReleaseFunctionDeployment } from './release-function-plan.mjs'
import { deploysDir, logicsRoot, toolsRoot, webRoot } from './deployment-config.mjs'

const root = webRoot
const releaseRepositoryRoot = resolve(process.env.GETGO_RELEASES_ROOT || join(root, '..', 'tnp-getgo-releases'))
const releasesRoot = join(releaseRepositoryRoot, 'web')
const command = process.argv[2]
const requestedRelease = process.argv[3]
const releaseNote = process.env.GETGO_RELEASE_NOTE?.trim()
const targetNames = { staging: 'getgo-staging', production: 'getgo' }
const releaseBranch = process.env.GETGO_RELEASES_BRANCH || 'main'

function fail(message) {
  console.error(`\nRelease failed: ${message}\n`)
  process.exit(1)
}

function run(executable, args, options = {}) {
  console.log(`$ ${executable} ${args.join(' ')}`)
  const result = spawnSync(executable, args, { cwd: root, stdio: 'inherit', ...options })
  if (result.status !== 0) fail(`${executable} exited with ${result.status ?? 'an unknown status'}.`)
}

function capture(executable, args, options = {}) {
  return execFileSync(executable, args, { cwd: root, encoding: 'utf8', ...options }).trim()
}

function missingRequiredSecrets(projectId, functionCodebases) {
  const secrets = [...new Set(functionCodebases.flatMap(codebase => codebase.requiredSecrets ?? []))]
  return secrets.filter(secret => {
    const result = spawnSync(
      'gcloud',
      ['secrets', 'describe', secret, `--project=${projectId}`, '--format=value(name)'],
      { cwd: root, encoding: 'utf8' },
    )
    return result.status !== 0 || !result.stdout.trim()
  })
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function copyDirectory(source, destination) {
  if (!existsSync(source)) fail(`Required release input is missing: ${source}`)
  cpSync(source, destination, {
    recursive: true,
    filter: current => basename(current) !== 'node_modules',
  })
}

function assertReleasePayload(payload) {
  const required = [
    'web/index.html',
    'firebase.json',
    'firebase/firestore.rules',
    'firebase/firestore.indexes.json',
    'firebase/storage.rules',
    'environments/staging.js',
    'environments/production.js',
    ...['functions-account', 'functions-marketplace', 'functions-billing'].flatMap(name => [
      `firebase/${name}/package.json`,
      `firebase/${name}/package-lock.json`,
      `firebase/${name}/lib`,
      `firebase/${name}/vendor`,
    ]),
  ]
  const missing = required.filter(relativePath => !existsSync(join(payload, relativePath)))
  if (missing.length > 0) fail(`Release payload is missing required runtime dependencies:\n${missing.join('\n')}`)
  if (existsSync(join(payload, 'content'))) fail('Release payload must not contain quiz or shared content.')
}

function releaseDirectories() {
  if (!existsSync(releasesRoot)) return []
  return readdirSync(releasesRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && existsSync(join(releasesRoot, entry.name, 'release.json')))
    .map(entry => entry.name)
    .sort()
    .reverse()
}

function manifestPath(releaseId) {
  return join(releasesRoot, releaseId, 'release.json')
}

function readManifest(releaseId) {
  const path = manifestPath(releaseId)
  if (!existsSync(path)) fail(`Unknown release: ${releaseId}`)
  return JSON.parse(readFileSync(path, 'utf8'))
}

function writeManifest(manifest) {
  writeFileSync(manifestPath(manifest.releaseId), `${JSON.stringify(manifest, null, 2)}\n`)
}

function assertGitLfs() {
  const result = spawnSync('git', ['lfs', 'version'], { cwd: root, encoding: 'utf8' })
  if (result.status !== 0) fail('Git LFS is required. Install it and run `git lfs install`.')
}

function pushReleaseHistory(tag) {
  run('git', ['push', 'origin', `HEAD:${releaseBranch}`], { cwd: releaseRepositoryRoot })
  if (tag) run('git', ['push', 'origin', tag], { cwd: releaseRepositoryRoot })
}

function assertReleaseRepository() {
  if (!existsSync(join(releaseRepositoryRoot, '.git')))
    fail(`GetGo Releases repository was not found at ${releaseRepositoryRoot}. Clone it or set GETGO_RELEASES_ROOT.`)
  mkdirSync(releasesRoot, { recursive: true })
}

function assertCleanSource() {
  const dirty = capture('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: root })
    .split('\n')
    .filter(Boolean)
    .filter(line => !line.slice(3).startsWith('releases/'))
  if (dirty.length > 0) fail(`Commit the source changes before creating a release:\n${dirty.join('\n')}`)
  const dirtyTools = capture('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: toolsRoot })
    .split('\n')
    .filter(Boolean)
  if (dirtyTools.length > 0) fail(`Commit the GetGo Tools deployment configuration before creating a release:\n${dirtyTools.join('\n')}`)
  const dirtyLogics = capture('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: logicsRoot })
    .split('\n')
    .filter(Boolean)
  if (dirtyLogics.length > 0) fail(`Commit the GetGo Logics backend source before creating a release:\n${dirtyLogics.join('\n')}`)
}

function generatedReleaseId() {
  const now = new Date()
  const date = now.toISOString().slice(0, 10).replaceAll('-', '.')
  const commit = capture('git', ['rev-parse', '--short=10', 'HEAD'])
  return `getgo-${date}-${commit}`
}

function releaseProgress(completed, label) {
  console.log(`GETGO_RELEASE_PROGRESS ${JSON.stringify({ completed, label })}`)
}

function createRelease() {
  releaseProgress(0, 'Validating release source')
  assertReleaseRepository()
  assertGitLfs()
  assertCleanSource()
  const releaseId = requestedRelease || generatedReleaseId()
  const releaseDir = join(releasesRoot, releaseId)
  if (existsSync(releaseDir)) fail(`Release ${releaseId} already exists and is immutable.`)

  run('node', [join(toolsRoot, 'scripts', 'deployment', 'deploy-web.mjs'), 'getgo', '--build-only', '--force'])
  releaseProgress(6, 'Application build checks completed')
  const workspace = mkdtempSync(join(tmpdir(), 'getgo-release-'))
  const payload = join(workspace, 'payload')
  const firebaseDir = join(payload, 'firebase')
  const environmentsDir = join(payload, 'environments')
  mkdirSync(firebaseDir, { recursive: true })
  mkdirSync(environmentsDir, { recursive: true })

  copyDirectory(join(root, 'dist'), join(payload, 'web'))
  for (const name of ['firestore.rules', 'firestore.indexes.json', 'storage.rules'])
    cpSync(join(deploysDir, 'getgo', name), join(firebaseDir, name))
  for (const name of ['functions-account', 'functions-marketplace', 'functions-billing'])
    copyDirectory(join(deploysDir, 'getgo', name), join(firebaseDir, name))

  const sourceFirebaseConfig = JSON.parse(readFileSync(join(deploysDir, 'getgo', 'firebase.json'), 'utf8'))
  const firebaseConfig = createRootFirebaseConfig(sourceFirebaseConfig)
  writeFileSync(join(payload, 'firebase.json'), `${JSON.stringify(firebaseConfig, null, 2)}\n`)
  releaseProgress(7, 'Web and Firebase payload assembled')

  for (const environment of ['staging', 'production']) {
    const generated = join(root, 'dist', 'release-configs', `${environment}.js`)
    if (!existsSync(generated)) fail(`Build did not generate ${generated}.`)
    cpSync(generated, join(environmentsDir, `${environment}.js`))
  }
  rmSync(join(payload, 'web', 'release-configs'), { recursive: true, force: true })
  releaseProgress(8, 'Environment configurations packaged')

  releaseProgress(9, 'Release inputs finalized')

  assertReleasePayload(payload)

  mkdirSync(releaseDir, { recursive: true })
  const archive = join(releaseDir, 'bundle.tar.gz')
  run('tar', ['-czf', archive, '-C', payload, '.'])
  const manifest = {
    schemaVersion: 2,
    releaseId,
    gitCommit: capture('git', ['rev-parse', 'HEAD'], { cwd: root }),
    deploymentConfigGitCommit: capture('git', ['rev-parse', 'HEAD'], { cwd: toolsRoot }),
    backendGitCommit: capture('git', ['rev-parse', 'HEAD'], { cwd: logicsRoot }),
    createdAt: new Date().toISOString(),
    ...(releaseNote ? { note: releaseNote } : {}),
    contents: {
      includes: ['compiled-web', 'firebase-functions', 'firestore-rules', 'firestore-indexes', 'storage-rules', 'environment-configurations'],
      excludes: ['quiz-content', 'shared-content', 'user-data'],
    },
    artifact: { file: 'bundle.tar.gz', sha256: sha256(archive), bytes: statSync(archive).size },
    environments: {
      staging: { target: targetNames.staging, status: 'not-deployed', events: [] },
      production: { target: targetNames.production, status: 'not-deployed', events: [] },
    },
  }
  writeManifest(manifest)
  releaseProgress(10, 'Immutable archive created and verified')
  rmSync(workspace, { recursive: true, force: true })
  run('git', ['add', '.gitattributes', 'README.md', 'web/.gitkeep', `web/${releaseId}`], { cwd: releaseRepositoryRoot })
  run('git', ['commit', '-m', `release(web): archive ${releaseId}`, '--', '.gitattributes', 'README.md', 'web/.gitkeep', `web/${releaseId}`], { cwd: releaseRepositoryRoot })
  run('git', ['tag', '-a', releaseId, '-m', `GetGo Web release ${releaseId}`], { cwd: releaseRepositoryRoot })
  releaseProgress(11, 'Git release committed and tagged')
  pushReleaseHistory(releaseId)
  releaseProgress(12, 'Release archive pushed')
  console.log(`GETGO_RELEASE_ARTIFACT ${JSON.stringify({ releaseId, archive, sha256: manifest.artifact.sha256 })}`)
  return releaseId
}

function latestStagedRelease() {
  return releaseDirectories().find(releaseId => readManifest(releaseId).environments.staging.status === 'deployed')
}

function activeRelease(environment) {
  return releaseDirectories()
    .map(releaseId => ({ releaseId, events: readManifest(releaseId).environments[environment].events ?? [] }))
    .flatMap(item => item.events.map(event => ({ releaseId: item.releaseId, deployedAt: event.deployedAt })))
    .sort((left, right) => right.deployedAt.localeCompare(left.deployedAt))[0]?.releaseId
}

function deleteRelease(releaseId) {
  const manifest = readManifest(releaseId)
  const activeEnvironments = ['staging', 'production'].filter(environment => activeRelease(environment) === releaseId)
  if (activeEnvironments.length > 0)
    fail(`${releaseId} is active in ${activeEnvironments.join(' and ')} and cannot be deleted.`)
  run('git', ['rm', '-r', `web/${releaseId}`], { cwd: releaseRepositoryRoot })
  run('git', ['commit', '-m', `release(web): delete ${releaseId}`, '--', `web/${releaseId}`], { cwd: releaseRepositoryRoot })
  pushReleaseHistory()
  const localTag = spawnSync('git', ['tag', '--list', releaseId], { cwd: releaseRepositoryRoot, encoding: 'utf8' }).stdout.trim()
  if (localTag) run('git', ['tag', '-d', releaseId], { cwd: releaseRepositoryRoot })
  const remoteTag = spawnSync('git', ['ls-remote', '--tags', 'origin', `refs/tags/${releaseId}`], { cwd: releaseRepositoryRoot, encoding: 'utf8' }).stdout.trim()
  if (remoteTag) run('git', ['push', 'origin', `:refs/tags/${releaseId}`], { cwd: releaseRepositoryRoot })
  console.log(`GETGO_RELEASE_DELETED ${JSON.stringify({ releaseId, gitCommit: manifest.gitCommit })}`)
}

function deployRelease(environment, releaseId, operation) {
  releaseProgress(0, `Validating ${releaseId}`)
  assertGitLfs()
  const manifest = readManifest(releaseId)
  const archive = join(releasesRoot, releaseId, manifest.artifact.file)
  if (!existsSync(archive)) fail(`Missing Git LFS artifact ${archive}. Run git lfs pull.`)
  if (sha256(archive) !== manifest.artifact.sha256) fail(`Checksum mismatch for ${releaseId}.`)
  releaseProgress(1, 'Release artifact verified')
  const workspace = mkdtempSync(join(tmpdir(), `getgo-${environment}-`))
  run('tar', ['-xzf', archive, '-C', workspace])
  releaseProgress(2, 'Release artifact extracted')
  cpSync(join(workspace, 'environments', `${environment}.js`), join(workspace, 'web', 'runtime-config.js'))
  const target = targetNames[environment]
  const targetConfig = JSON.parse(readFileSync(join(deploysDir, target, 'target.json'), 'utf8'))
  const runtimeSource = readFileSync(join(workspace, 'web', 'runtime-config.js'), 'utf8')
  if (!runtimeSource.includes(`"projectId":"${targetConfig.firebaseProject}"`))
    fail(`Runtime configuration does not target ${targetConfig.firebaseProject}.`)
  releaseProgress(3, `${environment} configuration verified`)

  const firebaseConfigPath = join(workspace, 'firebase.json')
  const archivedFirebaseConfigPath = existsSync(firebaseConfigPath)
    ? firebaseConfigPath
    : join(workspace, 'firebase', 'firebase.json')
  if (!existsSync(archivedFirebaseConfigPath)) fail('Release artifact does not contain firebase.json.')
  const firebaseConfig = createRootFirebaseConfig(
    JSON.parse(readFileSync(archivedFirebaseConfigPath, 'utf8')),
  )
  const missingSecrets = missingRequiredSecrets(
    targetConfig.firebaseProject,
    targetConfig.functionCodebases ?? [],
  )
  const functionPlan = planReleaseFunctionDeployment(targetConfig, firebaseConfig, missingSecrets)
  if (functionPlan.skippedCodebases.length > 0) {
    console.warn('\n⚠️  Skipping optional Function codebases whose required secrets are unavailable:')
    for (const codebase of functionPlan.skippedCodebases) {
      const missing = (codebase.requiredSecrets ?? []).filter(secret => missingSecrets.includes(secret))
      console.warn(`    ${codebase.name}: ${missing.join(', ')}`)
    }
    console.warn('    Web, rules, indexes, storage, and all other Function codebases will continue.\n')
  }
  firebaseConfig.functions = functionPlan.deployableFunctions
  writeFileSync(firebaseConfigPath, `${JSON.stringify(firebaseConfig, null, 2)}\n`)
  releaseProgress(4, functionPlan.skippedCodebases.length > 0
    ? 'Optional Functions filtered by secret availability'
    : 'Function deployment plan verified')

  for (const entry of functionPlan.deployableFunctions)
    run('npm', ['ci', '--ignore-scripts'], { cwd: join(workspace, entry.source) })
  releaseProgress(5, 'Function runtime dependencies installed')

  const deployTargets = [
    ...functionPlan.functionTargets,
    'firestore',
    'storage',
    'hosting',
  ]

  releaseProgress(5, `Deploying Web and Firebase to ${environment}`)
  run('firebase', [
    'deploy', '--project', targetConfig.firebaseProject,
    '--config', firebaseConfigPath,
    '--only', deployTargets.join(','), '--force',
    '-m', `${operation} ${releaseId}`,
  ], { cwd: workspace })
  releaseProgress(6, 'Web and Firebase resources deployed')

  const event = { operation, deployedAt: new Date().toISOString(), gitCommit: manifest.gitCommit }
  manifest.environments[environment].status = 'deployed'
  manifest.environments[environment].events.push(event)
  writeManifest(manifest)
  rmSync(workspace, { recursive: true, force: true })
  releaseProgress(7, 'Release deployment recorded')
  run('git', ['add', `web/${releaseId}/release.json`], { cwd: releaseRepositoryRoot })
  run('git', ['commit', '-m', `release(web): ${operation} ${releaseId} to ${environment}`, '--', `web/${releaseId}/release.json`], { cwd: releaseRepositoryRoot })
  pushReleaseHistory()
  releaseProgress(8, 'Release history synchronized')
  const outcome = functionPlan.skippedCodebases.length > 0 ? 'warning' : 'deployed'
  console.log(`GETGO_DEPLOY_RESULT ${JSON.stringify({
    outcome,
    deployed: deployTargets,
    skippedFunctionCodebases: functionPlan.skippedCodebases.map(codebase => codebase.name),
  })}`)
  console.log(`GETGO_RELEASE_RESULT ${JSON.stringify({ releaseId, environment, operation, outcome })}`)
}

assertReleaseRepository()
switch (command) {
  case 'create': createRelease(); break
  case 'staging': deployRelease('staging', requestedRelease || createRelease(), 'deploy'); break
  case 'production': {
    const releaseId = requestedRelease || latestStagedRelease()
    if (!releaseId) fail('No staged release is available to promote.')
    deployRelease('production', releaseId, 'promote')
    break
  }
  case 'rollback-staging':
  case 'rollback-production': {
    if (!requestedRelease) fail(`Usage: node scripts/release-web.mjs ${command} <release-id>`)
    deployRelease(command.endsWith('staging') ? 'staging' : 'production', requestedRelease, 'rollback')
    break
  }
  case 'delete': {
    if (!requestedRelease) fail('Usage: node scripts/release-web.mjs delete <release-id>')
    deleteRelease(requestedRelease)
    break
  }
  case 'list':
    for (const releaseId of releaseDirectories()) {
      const item = readManifest(releaseId)
      console.log(`${releaseId}\tstaging=${item.environments.staging.status}\tproduction=${item.environments.production.status}`)
    }
    break
  default:
    fail('Usage: release-web.mjs create|staging|production|rollback-staging|rollback-production|delete|list [release-id]')
}
