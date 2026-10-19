import assert from 'node:assert/strict'
import test from 'node:test'
import { ensureGoogleCloudService, ensureStorageFirestoreRulesIam, missingGoogleCloudSecrets } from './storage-firestore-iam.mjs'

const projectNumber = '296413485822'
const account = `service-${projectNumber}@gcp-sa-firebasestorage.iam.gserviceaccount.com`
const role = 'roles/firebaserules.firestoreServiceAgent'

test('skips IAM when Storage rules do not read Firestore', () => {
  const result = ensureStorageFirestoreRulesIam({ projectId: 'tnp-getgo-stg', storageRulesSource: 'allow read: if true;', execute: () => assert.fail('gcloud should not run') })
  assert.deepEqual(result, { required: false, changed: false })
})

test('keeps an existing cross-service IAM binding unchanged', () => {
  const calls = []
  const result = ensureStorageFirestoreRulesIam({
    projectId: 'tnp-getgo-stg', storageRulesSource: 'allow read: if firestore.exists(/databases/x);',
    execute: (command, args) => { calls.push([command, args]); return calls.length === 1 ? { status: 0, stdout: projectNumber } : { status: 0, stdout: role } },
  })
  assert.deepEqual(result, { required: true, changed: false, role, serviceAccount: account })
  assert.equal(calls.length, 2)
})

test('grants and verifies a missing cross-service IAM binding', () => {
  const calls = []
  const outputs = [projectNumber, '', 'binding updated', role]
  const result = ensureStorageFirestoreRulesIam({
    projectId: 'tnp-getgo-stg', storageRulesSource: 'allow read: if firestore.get(/databases/x).data;',
    execute: (command, args) => { calls.push([command, args]); return { status: 0, stdout: outputs[calls.length - 1] } },
  })
  assert.deepEqual(result, { required: true, changed: true, role, serviceAccount: account })
  assert.equal(calls[2][1][1], 'add-iam-policy-binding')
  assert.ok(calls[2][1].includes(`--member=serviceAccount:${account}`))
  assert.ok(calls[2][1].includes(`--role=${role}`))
})

test('reports a precise error when the caller cannot update IAM', () => {
  let call = 0
  assert.throws(() => ensureStorageFirestoreRulesIam({
    projectId: 'tnp-getgo-stg', storageRulesSource: 'firestore.exists(/databases/x)',
    execute: () => ++call === 1 ? { status: 0, stdout: projectNumber } : call === 2 ? { status: 0, stdout: '' } : { status: 1, stderr: 'setIamPolicy denied' },
  }), /setIamPolicy denied/)
})

test('enables and verifies a required Google Cloud service', () => {
  const outputs = ['', '', 'secretmanager.googleapis.com']
  let call = 0
  const result = ensureGoogleCloudService({
    projectId: 'tnp-getgo-stg', service: 'secretmanager.googleapis.com',
    execute: () => ({ status: 0, stdout: outputs[call++] }),
  })
  assert.deepEqual(result, { changed: true, service: 'secretmanager.googleapis.com' })
  assert.equal(call, 3)
})

test('reports every missing required project secret', () => {
  const present = new Set(['GETGO_AI_OPENAI_API_KEY'])
  const missing = missingGoogleCloudSecrets({
    projectId: 'tnp-getgo-stg', secrets: ['GETGO_VIETQR_CONFIG', 'GETGO_AI_OPENAI_API_KEY'],
    execute: (_command, args) => present.has(args[2]) ? { status: 0, stdout: args[2] } : { status: 1, stdout: '' },
  })
  assert.deepEqual(missing, ['GETGO_VIETQR_CONFIG'])
})
