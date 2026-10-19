import assert from 'node:assert/strict'
import test from 'node:test'
import { createRootFirebaseConfig, planReleaseFunctionDeployment } from './release-function-plan.mjs'

const targetConfig = {
  functionCodebases: [
    { id: 'account', name: 'getgo-account' },
    { id: 'marketplace', name: 'getgo-marketplace' },
    { id: 'billing', name: 'getgo-billing', requiredSecrets: ['GETGO_VIETQR_CONFIG'] },
  ],
}
const firebaseConfig = {
  hosting: { public: '../../../dist' },
  firestore: { rules: 'firestore.rules', indexes: 'firestore.indexes.json' },
  storage: { rules: 'storage.rules' },
  functions: [
    { source: 'functions-account', codebase: 'getgo-account' },
    { source: 'functions-marketplace', codebase: 'getgo-marketplace' },
    { source: 'functions-billing', codebase: 'getgo-billing' },
  ],
}

test('makes the extracted bundle a self-contained Firebase project root', () => {
  const rooted = createRootFirebaseConfig(firebaseConfig)

  assert.equal(rooted.hosting.public, 'web')
  assert.deepEqual(rooted.firestore, {
    rules: 'firebase/firestore.rules',
    indexes: 'firebase/firestore.indexes.json',
  })
  assert.equal(rooted.storage.rules, 'firebase/storage.rules')
  assert.deepEqual(rooted.functions.map(entry => entry.source), [
    'firebase/functions-account',
    'firebase/functions-marketplace',
    'firebase/functions-billing',
  ])
  assert.equal(firebaseConfig.hosting.public, '../../../dist')
})

test('normalizes an older archived Firebase config without duplicating path prefixes', () => {
  const rooted = createRootFirebaseConfig(createRootFirebaseConfig(firebaseConfig))

  assert.equal(rooted.firestore.rules, 'firebase/firestore.rules')
  assert.equal(rooted.functions[0].source, 'firebase/functions-account')
})

test('skips only a codebase whose required secret is missing', () => {
  const plan = planReleaseFunctionDeployment(
    targetConfig,
    firebaseConfig,
    ['GETGO_VIETQR_CONFIG'],
  )

  assert.deepEqual(plan.functionTargets, [
    'functions:getgo-account',
    'functions:getgo-marketplace',
  ])
  assert.deepEqual(plan.deployableFunctions.map(entry => entry.source), [
    'functions-account',
    'functions-marketplace',
  ])
  assert.deepEqual(plan.skippedCodebases.map(codebase => codebase.name), ['getgo-billing'])
})

test('deploys every configured codebase when its secrets are available', () => {
  const plan = planReleaseFunctionDeployment(targetConfig, firebaseConfig, [])

  assert.deepEqual(plan.functionTargets, [
    'functions:getgo-account',
    'functions:getgo-marketplace',
    'functions:getgo-billing',
  ])
  assert.deepEqual(plan.skippedCodebases, [])
})
