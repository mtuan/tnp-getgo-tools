export function createRootFirebaseConfig(firebaseConfig) {
  const rooted = structuredClone(firebaseConfig)
  const firebasePath = value => value.startsWith('firebase/') ? value : `firebase/${value}`

  rooted.hosting = { ...rooted.hosting, public: 'web' }
  rooted.firestore = {
    ...rooted.firestore,
    rules: firebasePath(rooted.firestore.rules),
    indexes: firebasePath(rooted.firestore.indexes),
  }
  rooted.storage = { ...rooted.storage, rules: firebasePath(rooted.storage.rules) }
  rooted.functions = (rooted.functions ?? []).map(entry => ({
    ...entry,
    source: firebasePath(entry.source),
  }))
  return rooted
}

export function planReleaseFunctionDeployment(targetConfig, firebaseConfig, missingSecrets) {
  const unavailableSecrets = new Set(missingSecrets)
  const configuredCodebases = targetConfig.functionCodebases ?? []
  const skippedCodebases = configuredCodebases.filter(codebase =>
    (codebase.requiredSecrets ?? []).some(secret => unavailableSecrets.has(secret)),
  )
  const skippedNames = new Set(skippedCodebases.map(codebase => codebase.name))
  const deployableFunctions = (firebaseConfig.functions ?? []).filter(entry =>
    !entry.codebase || !skippedNames.has(entry.codebase),
  )

  return {
    deployableFunctions,
    functionTargets: deployableFunctions.map(entry =>
      entry.codebase ? `functions:${entry.codebase}` : 'functions',
    ),
    skippedCodebases,
  }
}
