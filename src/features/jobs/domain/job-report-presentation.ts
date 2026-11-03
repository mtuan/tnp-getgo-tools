import type { BackgroundJobLog } from "../../../shared/domain/models.js";

export function conciseJobError(
  error: string,
  copy: { connectionError: string; longError: string },
) {
  if (/workspace routing discovery failed|failed to refresh available models|error sending request.*chatgpt\.com|connection failed/i.test(error))
    return copy.connectionError;
  try {
    const issues = JSON.parse(error) as Array<{ path?: Array<string | number>; message?: string }>;
    const issue = Array.isArray(issues) ? issues[0] : undefined;
    if (issue?.message) {
      const location = issue.path?.length ? issue.path.map(String).join(".") : "";
      return location ? `${location}: ${issue.message}` : issue.message;
    }
  } catch {
    // Ordinary errors are not JSON validation reports.
  }
  const lines = error.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  return error.length > 500 || lines.length > 6 ? copy.longError : lines[0] ?? copy.longError;
}

export function compactJobLogs(logs: BackgroundJobLog[], errorSummary: string) {
  const compacted = logs.map(log => log.stream === "stderr" && (log.message.length > 500 || log.message.split(/\r?\n/).length > 6)
    ? { ...log, message: errorSummary }
    : log);
  return compacted.filter((log, index) => index === 0
    || log.stream !== compacted[index - 1].stream
    || log.message !== compacted[index - 1].message);
}
