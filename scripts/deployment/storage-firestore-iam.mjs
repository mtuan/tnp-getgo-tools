const role = 'roles/firebaserules.firestoreServiceAgent'

function outputOf(result) {
  return `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
}

export function storageRulesReadFirestore(source) {
  return source.includes('firestore.get(') || source.includes('firestore.exists(')
}

export function ensureStorageFirestoreRulesIam({ projectId, storageRulesSource, execute }) {
  if (!storageRulesReadFirestore(storageRulesSource)) return { required: false, changed: false }
  if (!/^[a-z0-9-]+$/.test(projectId)) throw new Error(`Invalid Firebase project id: ${projectId}`)

  const project = execute('gcloud', ['projects', 'describe', projectId, '--format=value(projectNumber)'])
  const projectNumber = project.status === 0 ? project.stdout.trim() : ''
  if (!projectNumber) {
    throw new Error(`Cannot configure Cloud Storage-to-Firestore Rules IAM for ${projectId}. Install/authenticate gcloud, then retry.\n${outputOf(project)}`.trim())
  }

  const serviceAccount = `service-${projectNumber}@gcp-sa-firebasestorage.iam.gserviceaccount.com`
  const policyArgs = ['projects', 'get-iam-policy', projectId, '--flatten=bindings[].members', `--filter=bindings.role=${role} AND bindings.members=serviceAccount:${serviceAccount}`, '--format=value(bindings.role)']
  const existing = execute('gcloud', policyArgs)
  if (existing.status === 0 && existing.stdout.trim() === role) {
    return { required: true, changed: false, role, serviceAccount }
  }

  const grantArgs = ['projects', 'add-iam-policy-binding', projectId, `--member=serviceAccount:${serviceAccount}`, `--role=${role}`, '--quiet']
  const granted = execute('gcloud', grantArgs)
  if (granted.status !== 0) {
    throw new Error([
      `Could not grant Cloud Storage-to-Firestore Rules IAM in ${projectId}.`,
      `The signed-in gcloud account needs permission to update the project's IAM policy.`,
      `$ gcloud ${grantArgs.slice(0, -1).join(' ')}`,
      outputOf(granted),
    ].filter(Boolean).join('\n'))
  }

  const verified = execute('gcloud', policyArgs)
  if (verified.status !== 0 || verified.stdout.trim() !== role) {
    throw new Error(`IAM update completed but verification failed for ${serviceAccount}.\n${outputOf(verified)}`.trim())
  }
  return { required: true, changed: true, role, serviceAccount }
}

export function ensureGoogleCloudService({ projectId, service, execute }) {
  if (!/^[a-z0-9-]+$/.test(projectId)) throw new Error(`Invalid Google Cloud project id: ${projectId}`)
  if (!/^[a-z0-9.-]+\.googleapis\.com$/.test(service)) throw new Error(`Invalid Google Cloud service: ${service}`)
  const listArgs = ['services', 'list', '--enabled', `--project=${projectId}`, `--filter=config.name:${service}`, '--format=value(config.name)']
  const current = execute('gcloud', listArgs)
  if (current.status === 0 && current.stdout.trim() === service) return { changed: false, service }
  const enabled = execute('gcloud', ['services', 'enable', service, `--project=${projectId}`, '--quiet'])
  if (enabled.status !== 0) {
    throw new Error([`Could not enable ${service} in ${projectId}.`, 'The signed-in gcloud account needs permission to enable project services.', outputOf(enabled)].filter(Boolean).join('\n'))
  }
  const verified = execute('gcloud', listArgs)
  if (verified.status !== 0 || verified.stdout.trim() !== service) {
    throw new Error(`${service} was enabled but verification failed in ${projectId}.\n${outputOf(verified)}`.trim())
  }
  return { changed: true, service }
}

export function missingGoogleCloudSecrets({ projectId, secrets, execute }) {
  return secrets.filter(secret => {
    if (!/^[A-Z][A-Z0-9_]+$/.test(secret)) throw new Error(`Invalid Secret Manager secret name: ${secret}`)
    const result = execute('gcloud', ['secrets', 'describe', secret, `--project=${projectId}`, '--format=value(name)'])
    return result.status !== 0 || !result.stdout.trim()
  })
}
