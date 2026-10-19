import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadDeploymentTargets, resolveDeploymentPath, webRoot } from './deployment-config.mjs'

const slash = value => value.replace(/\\/g, '/')

export function assembleFirebaseConfig(targetName) {
  const target = loadDeploymentTargets()[targetName]
  if (!target) throw new Error(`Unknown deployment target: ${targetName}`)
  const deployRoot = resolveDeploymentPath(target.resourceDir ?? `configs/deploys/${targetName}`)
  const outputPath = resolveDeploymentPath(target.firebaseConfig ?? join(deployRoot, 'firebase.json'))
  const contractPath = join(webRoot, 'configs', 'web', 'getgo', 'firebase.hosting.json')
  if (!existsSync(contractPath)) throw new Error(`Missing Web Hosting contract: ${contractPath}`)
  const contract = JSON.parse(readFileSync(contractPath, 'utf8'))
  const functions = (target.functionCodebases ?? []).map(codebase => ({
    source: relative(deployRoot, `${join(deployRoot, 'functions')}-${codebase.id}`),
    codebase: codebase.name,
    predeploy: [],
  }))
  const config = {
    ...contract,
    hosting: {...contract.hosting, public: slash(join(webRoot, 'dist'))},
    firestore: {rules: 'firestore.rules', indexes: 'firestore.indexes.json'},
    storage: {rules: 'storage.rules'},
    functions,
  }
  mkdirSync(dirname(outputPath), {recursive: true})
  writeFileSync(outputPath, `${JSON.stringify(config, null, 2)}\n`)
  return outputPath
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(assembleFirebaseConfig(process.argv[2] || 'getgo'))
}
