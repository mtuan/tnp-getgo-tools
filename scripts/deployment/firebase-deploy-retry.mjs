const transientFirebasePatterns = [
  /\bECONNRESET\b/i,
  /\bETIMEDOUT\b/i,
  /\bEAI_AGAIN\b/i,
  /socket hang up/i,
  /network connection was lost/i,
  /request .* failed, reason: read ECONNRESET/i,
  /\b(?:HTTP )?429\b/i,
  /\b(?:HTTP )?5\d\d\b/i,
  /service (?:is )?unavailable/i,
  /upstream request timeout/i,
  /Error: Timed out\./i,
];

export function isTransientFirebaseFailure(output) {
  return transientFirebasePatterns.some(pattern => pattern.test(output));
}

export function runWithFirebaseRetry({ execute, onRetry, wait, maxAttempts = 3 }) {
  let result;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    result = execute(attempt);
    if (result.status === 0) return result;
    if (!isTransientFirebaseFailure(result.output) || attempt === maxAttempts) return result;
    onRetry?.({ attempt, maxAttempts, delayMs: attempt * 2_000 });
    wait?.(attempt * 2_000);
  }
  return result;
}
