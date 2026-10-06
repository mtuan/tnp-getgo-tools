import type { AppSettings, DesktopApi } from "../../../shared/domain/models";

export async function confirmContentSafetyReview(
  api: Pick<DesktopApi, "inspectContentSafety">,
  value: unknown,
  locale: AppSettings["locale"],
): Promise<boolean> {
  const findings = await api.inspectContentSafety(value);
  if (!findings.length) return true;

  const visible = findings.slice(0, 8).map((finding) =>
    `${finding.path}: “${finding.term}”\n${finding.excerpt}`,
  ).join("\n\n");
  const remaining = findings.length > 8
    ? locale === "vi"
      ? `\n\nVà ${findings.length - 8} cảnh báo khác.`
      : `\n\nAnd ${findings.length - 8} more warnings.`
    : "";
  const message = locale === "vi"
    ? `Phát hiện từ có thể không an toàn:\n\n${visible}${remaining}\n\nNội dung do quản trị viên kiểm duyệt. Bạn có chắc muốn đánh dấu là đã duyệt?`
    : `Potentially unsafe words were detected:\n\n${visible}${remaining}\n\nThis content requires administrator judgment. Mark it as reviewed anyway?`;
  return window.confirm(message);
}
