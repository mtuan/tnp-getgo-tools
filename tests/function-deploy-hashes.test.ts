import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { functionDeployHashes } from '../scripts/deployment/function-deploy-hashes.mjs'

test('function deployment hashes change only for exports that depend on the edited declaration', async () => {
  const root = await mkdtemp(join(tmpdir(), 'getgo-function-hashes-'))
  try {
    await mkdir(join(root, 'src'))
    await writeFile(join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { module: 'NodeNext', moduleResolution: 'NodeNext', target: 'ES2022' }, include: ['src'] }))
    await writeFile(join(root, 'package.json'), JSON.stringify({ type: 'module' }))
    await writeFile(join(root, 'package-lock.json'), '{}')
    await writeFile(join(root, 'src', 'deploymentConfig.ts'), 'export const region = "test"\n')
    await writeFile(join(root, 'src', 'functions.ts'), 'const shared = 1\nconst onlyA = 2\nexport const functionA = () => shared + onlyA\nexport const functionB = () => shared\n')
    await writeFile(join(root, 'src', 'index.ts'), 'export { functionA, functionB } from "./functions.js"\n')
    const before = functionDeployHashes(root)
    await writeFile(join(root, 'src', 'functions.ts'), 'const shared = 1\nconst onlyA = 3\nexport const functionA = () => shared + onlyA\nexport const functionB = () => shared\n')
    const after = functionDeployHashes(root)
    assert.notEqual(after.get('functionA'), before.get('functionA'))
    assert.equal(after.get('functionB'), before.get('functionB'))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('unrelated lockfile and vendored archive changes do not invalidate functions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'getgo-function-hashes-'))
  try {
    await mkdir(join(root, 'src'))
    await mkdir(join(root, 'vendor'))
    await writeFile(join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { module: 'NodeNext', moduleResolution: 'NodeNext', target: 'ES2022' }, include: ['src'] }))
    await writeFile(join(root, 'package.json'), JSON.stringify({ type: 'module', dependencies: { used: '1.0.0', unused: 'file:vendor/unused.tgz' } }))
    await writeFile(join(root, 'package-lock.json'), JSON.stringify({ packages: { 'node_modules/used': { version: '1.0.0', integrity: 'used-1' }, 'node_modules/unused': { version: '1.0.0', integrity: 'unused-1' } } }))
    await writeFile(join(root, 'vendor', 'unused.tgz'), 'first')
    await writeFile(join(root, 'src', 'types.d.ts'), 'declare module "used" { export function value(): number }\n')
    await writeFile(join(root, 'src', 'index.ts'), 'import { value } from "used"\nexport const functionA = () => value()\nexport const functionB = () => 2\n')
    const before = functionDeployHashes(root)
    await writeFile(join(root, 'vendor', 'unused.tgz'), 'second')
    await writeFile(join(root, 'package-lock.json'), JSON.stringify({ name: 'metadata-only', packages: { 'node_modules/used': { version: '1.0.0', integrity: 'used-1' }, 'node_modules/unused': { version: '2.0.0', integrity: 'unused-2' } } }))
    const after = functionDeployHashes(root)
    assert.deepEqual(after, before)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('runtime package changes invalidate only functions that import that dependency', async () => {
  const root = await mkdtemp(join(tmpdir(), 'getgo-function-hashes-'))
  try {
    await mkdir(join(root, 'src'))
    await writeFile(join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { module: 'NodeNext', moduleResolution: 'NodeNext', target: 'ES2022' }, include: ['src'] }))
    await writeFile(join(root, 'package.json'), JSON.stringify({ type: 'module', dependencies: { used: '1.0.0' } }))
    await writeFile(join(root, 'package-lock.json'), JSON.stringify({ packages: { 'node_modules/used': { version: '1.0.0', integrity: 'used-1' } } }))
    await writeFile(join(root, 'src', 'types.d.ts'), 'declare module "used" { export function value(): number }\n')
    await writeFile(join(root, 'src', 'helper.ts'), 'import { value } from "used"\nexport const helper = () => value()\n')
    await writeFile(join(root, 'src', 'index.ts'), 'import { helper } from "./helper.js"\nexport const functionA = () => helper()\nexport const functionB = () => 2\n')
    const before = functionDeployHashes(root)
    await writeFile(join(root, 'package-lock.json'), JSON.stringify({ packages: { 'node_modules/used': { version: '1.1.0', integrity: 'used-2' } } }))
    const after = functionDeployHashes(root)
    assert.notEqual(after.get('functionA'), before.get('functionA'))
    assert.equal(after.get('functionB'), before.get('functionB'))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
