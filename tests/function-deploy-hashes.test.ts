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
