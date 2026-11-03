const unavailablePatterns = [
  /\bhttp(?: status)?:?\s*429\b/i,
  /\b(?:status(?: code)?|response)\s*429\b/i,
  /\brate[_ -]?limit(?:ed|ing|[_ -]?exceeded)?\b/i,
  /\binsufficient[_ -]?quota\b/i,
  /\bquota (?:has been )?exceeded\b/i,
  /\busage limit\b/i,
  /\b(?:five|5)[ -]?hour limit\b/i,
  /\bweekly limit\b/i,
  /\b(?:limit|quota) (?:has been )?reached\b/i,
  /\byou(?:'ve| have) hit (?:your |the )?(?:current )?(?:usage |rate )?limit\b/i,
  /\btoo many requests\b/i,
  /\bservice (?:is )?(?:temporarily )?unavailable\b/i,
  /\btemporarily unavailable\b/i,
  /\bserver (?:is )?(?:currently )?overloaded\b/i,
  /\boverloaded_error\b/i,
  /\bno capacity\b/i,
  /\bopenai request could not be completed\b/i,
  /\blocal ai is not configured\b/i,
  /\bcodex cli could not start\b/i,
  /\bauthentication (?:failed|required)\b/i,
  /\binvalid[_ -]?api[_ -]?key\b/i,
];

function errorMessages(cause: unknown): string[] {
  const messages: string[] = [];
  const visited = new Set<unknown>();
  let current = cause;
  while (current && !visited.has(current)) {
    visited.add(current);
    if (current instanceof Error) {
      messages.push(current.message);
      current = current.cause;
    } else {
      messages.push(String(current));
      break;
    }
  }
  return messages;
}

export function isAiServiceUnavailableError(cause: unknown): boolean {
  return errorMessages(cause).some(message => unavailablePatterns.some(pattern => pattern.test(message)));
}
