import assert from 'node:assert/strict'
import test from 'node:test'
import { isTransientFirebaseFailure, runWithFirebaseRetry } from './firebase-deploy-retry.mjs'

test('recognizes Firebase transport failures as transient', () => {
  assert.equal(isTransientFirebaseFailure('FetchError: request failed, reason: read ECONNRESET'), true)
  assert.equal(isTransientFirebaseFailure('Error: Timed out.'), true)
  assert.equal(isTransientFirebaseFailure('HTTP 503 service unavailable'), true)
})

test('does not retry configuration or permission failures', () => {
  assert.equal(isTransientFirebaseFailure('Missing required secret GETGO_APPLE_IAP_CONFIG'), false)
  assert.equal(isTransientFirebaseFailure('HTTP Error: 403, permission denied'), false)
})

test('retries only a failed transient deployment step', () => {
  let attempts = 0
  const delays = []
  const result = runWithFirebaseRetry({
    execute: () => {
      attempts += 1
      return attempts === 1
        ? { status: 2, output: 'read ECONNRESET\nError: Timed out.' }
        : { status: 0, output: 'deployed' }
    },
    onRetry: ({ delayMs }) => delays.push(delayMs),
    wait: () => {},
  })
  assert.equal(result.status, 0)
  assert.equal(attempts, 2)
  assert.deepEqual(delays, [2_000])
})

test('returns a permanent failure without retrying', () => {
  let attempts = 0
  const result = runWithFirebaseRetry({
    execute: () => {
      attempts += 1
      return { status: 1, output: 'permission denied' }
    },
    wait: () => {},
  })
  assert.equal(result.status, 1)
  assert.equal(attempts, 1)
})
