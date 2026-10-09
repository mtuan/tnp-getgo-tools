import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { LogIn, Pencil, Plus, RefreshCw } from "lucide-react";
import type { AppSettings, GetGoMemberAccount, GetGoMemberPage, GetGoMembershipTier } from "../../../shared/domain/models";
import { useAuth } from "../../authentication/components/AuthContext";
import * as ui from "../../../shared/ui";
import { memberLoginUrl } from "../domain/member-login-url";
import { defaultPremiumMembershipPeriod } from "../domain/premium-membership-period";

type MemberFilter = "all" | GetGoMembershipTier;
const PAGE_SIZE = 50;
const dateInputValue = (value: string | null): string => value ? value.slice(0, 10) : "";
type TestAccountDraft = {email: string; password: string; scenario: "matched-topics" | "manual-topics"; projectId: string};

export function MembersPage({ locale, environment }: { locale: AppSettings["locale"]; environment: AppSettings["environment"] }) {
  const vi = locale === "vi";
  const auth = useAuth();
  const toast = ui.useToast();
  const [result, setResult] = useState<GetGoMemberPage | null>(null);
  const [filter, setFilter] = useState<MemberFilter>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [cursors, setCursors] = useState<Array<string | null>>([null]);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<GetGoMemberAccount | null>(null);
  const [membership, setMembership] = useState<GetGoMembershipTier>("free");
  const [startsAt, setStartsAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testAccount, setTestAccount] = useState<TestAccountDraft | null>(null);
  const copy = useMemo(() => vi ? ({
    eyebrow: "Người dùng", title: "Thành viên GetGo", description: "Quản lý thành viên miễn phí, Premium và quản trị viên.",
    all: "Tất cả", free: "Miễn phí", premium: "Premium", admin: "Quản trị", name: "Tên", email: "Email", membership: "Loại thành viên", account: "Tài khoản", active: "Đang hoạt động", orphaned: "Hồ sơ mồ côi", orphanedHelp: "UID này không còn tài khoản đăng nhập tương ứng",
    period: "Thời hạn", starts: "Bắt đầu", expires: "Kết thúc", immediate: "Ngay lập tức", never: "Không hết hạn", edit: "Đổi loại thành viên", login: "Mở trang đăng nhập", refresh: "Làm mới",
    search: "Tên bắt đầu bằng…, email chính xác hoặc UID", clear: "Xóa tìm kiếm", empty: "Không có thành viên phù hợp.", loading: "Đang tải thành viên",
    save: "Lưu thay đổi", cancel: "Hủy", saved: "Đã cập nhật thành viên", loadFailed: "Không thể tải thành viên", saveFailed: "Không thể cập nhật thành viên",
    delete: "Xóa thành viên", deleteConfirm: "Xóa vĩnh viễn thành viên này cùng toàn bộ dữ liệu?", deleteConfirmAction: "Xóa vĩnh viễn", deleting: "Đang xóa thành viên và toàn bộ dữ liệu…", deleted: "Đã xóa thành viên", deleteFailed: "Không thể xóa thành viên",
    confirm: "Thay đổi này cập nhật quyền truy cập, lịch sử gói thành viên và nhật ký quản trị.", previous: "Trang trước", next: "Trang sau", page: "Trang", pageSize: "Tối đa 50 tài khoản mỗi trang",
    addTest: "Thêm tài khoản thử nghiệm", createTest: "Tạo tài khoản", testPassword: "Mật khẩu", testScenario: "Kịch bản chủ đề", matchedTopics: "Tự ghép IKMC/TIMO", manualTopics: "Cần chọn lại chủ đề", testHelp: "Tạo tài khoản cũ giả lập gồm hồ sơ phụ huynh và học sinh lớp 5. Không tạo lịch sử học tập.", testCreated: "Đã tạo tài khoản thử nghiệm", testCreateFailed: "Không thể tạo tài khoản thử nghiệm", suggesting: "Đang tìm email trống…", passwordHelp: "Ít nhất 8 ký tự. Mật khẩu không được lưu trong GetGo Tools.",
  }) : ({
    eyebrow: "Users", title: "GetGo members", description: "Manage Free, Premium, and Admin members.",
    all: "All", free: "Free", premium: "Premium", admin: "Admin", name: "Name", email: "Email", membership: "Membership", account: "Account", active: "Active", orphaned: "Orphaned profile", orphanedHelp: "This UID no longer has a corresponding sign-in account",
    period: "Effective period", starts: "Starts", expires: "Ends", immediate: "Immediately", never: "Never", edit: "Change membership", login: "Open sign-in page", refresh: "Refresh",
    search: "Name starts with…, exact email, or UID", clear: "Clear search", empty: "No matching members.", loading: "Loading members",
    save: "Save changes", cancel: "Cancel", saved: "Membership updated", loadFailed: "Could not load members", saveFailed: "Could not update membership",
    delete: "Delete member", deleteConfirm: "Permanently delete this member and all of their data?", deleteConfirmAction: "Delete permanently", deleting: "Deleting member and all associated data…", deleted: "Member deleted", deleteFailed: "Could not delete member",
    confirm: "This updates account access, subscription history, and the administration audit log.", previous: "Previous page", next: "Next page", page: "Page", pageSize: "Up to 50 accounts per page",
    addTest: "Add test account", createTest: "Create account", testPassword: "Password", testScenario: "Topic scenario", matchedTopics: "Auto-match IKMC/TIMO", manualTopics: "Require topic reassignment", testHelp: "Creates a legacy-shaped parent and Grade 5 student without study history.", testCreated: "Test account created", testCreateFailed: "Could not create test account", suggesting: "Finding an available email…", passwordHelp: "At least 8 characters. GetGo Tools does not store this password.",
  }), [vi]);

  useEffect(() => {
    const timeout = window.setTimeout(() => { setDebouncedSearch(search.trim()); setPage(1); setCursors([null]); }, 300);
    return () => window.clearTimeout(timeout);
  }, [search]);
  const load = useCallback(() => auth.requireAuth(async () => {
    setLoading(true); setError(null);
    try {
      setResult(await window.getgo.listGetGoMembers({
        ...(filter !== "all" ? { membership: filter } : {}),
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
        ...(cursors[page - 1] ? { cursor: cursors[page - 1]! } : {}),
        limit: PAGE_SIZE,
      }));
    } catch (cause) {
      const message = String(cause); setError(message);
      toast.show({ title: copy.loadFailed, description: message, variant: "error" });
    } finally { setLoading(false); }
  }), [auth.requireAuth, copy.loadFailed, cursors, debouncedSearch, filter, page, toast]);
  useEffect(() => { void load(); }, [load, refresh]);

  const membershipLabel = useCallback((value: GetGoMembershipTier) => copy[value], [copy]);
  const changeMembership = (nextMembership: GetGoMembershipTier) => {
    if (nextMembership === "premium" && membership !== "premium") {
      const defaults = defaultPremiumMembershipPeriod();
      setStartsAt(current => current || defaults.startsAt);
      setExpiresAt(current => current || defaults.expiresAt);
    }
    setMembership(nextMembership);
  };
  const openEditor = useCallback((item: GetGoMemberAccount) => {
    setEditing(item); setMembership(item.membership); setStartsAt(dateInputValue(item.subscriptionStartsAt)); setExpiresAt(dateInputValue(item.subscriptionExpiresAt)); setError(null);
  }, []);
  const columns = useMemo<ui.DataColumn<GetGoMemberAccount>[]>(() => [
    { key: "name", title: copy.name, render: item => <strong>{item.name || "—"}</strong> },
    { key: "email", title: copy.email, render: item => <><span>{item.email || "—"}</span><small className="ui-table-secondary">{item.id}</small></> },
    { key: "membership", title: copy.membership, render: item => <ui.StatusBadge tone={item.membership === "admin" ? "primary" : item.membership === "premium" ? "warning" : "neutral"}>{membershipLabel(item.membership)}</ui.StatusBadge> },
    { key: "account", title: copy.account, render: item => <ui.StatusBadge tone={item.accountStatus === "orphaned" ? "danger" : "success"} title={item.accountStatus === "orphaned" ? copy.orphanedHelp : copy.active}>{copy[item.accountStatus]}</ui.StatusBadge> },
    { key: "period", title: copy.period, render: item => item.membership !== "premium" ? copy.never : <span>{item.subscriptionStartsAt ? new Intl.DateTimeFormat(locale).format(new Date(item.subscriptionStartsAt)) : copy.immediate} – {item.subscriptionExpiresAt ? new Intl.DateTimeFormat(locale).format(new Date(item.subscriptionExpiresAt)) : copy.never}</span> },
    { key: "actions", title: "", role: "actions", width: 104, render: item => <div className="job-table-actions">
      <ui.TableActionButton color="neutral" icon={<LogIn />} aria-label={copy.login} title={copy.login} disabled={!item.email || item.accountStatus === "orphaned"} onClick={() => void window.getgo.openExternal(memberLoginUrl(environment, item.email))} />
      <ui.TableActionButton icon={<Pencil />} aria-label={copy.edit} title={copy.edit} onClick={() => openEditor(item)} />
    </div> },
  ], [copy, environment, locale, membershipLabel, openEditor]);

  const save = (event: FormEvent) => auth.requireAuth(async () => {
    event.preventDefault();
    if (!editing) return;
    setBusy(true); setError(null);
    try {
      await window.getgo.setGetGoMembership(editing.id, membership, membership === "premium" ? startsAt || null : null, membership === "premium" ? expiresAt || null : null);
      setEditing(null); setRefresh(value => value + 1);
      toast.show({ title: copy.saved, variant: "success" });
    } catch (cause) { const message = String(cause); setError(message); toast.show({ title: copy.saveFailed, description: message, variant: "error" }); }
    finally { setBusy(false); }
  });
  const remove = async () => {
    if (!editing) return;
    setBusy(true); setError(null);
    try {
      await window.getgo.deleteGetGoMember(editing.id);
      setResult(current => current ? { ...current, items: current.items.filter(item => item.id !== editing.id) } : current);
      setEditing(null);
      toast.show({ title: copy.deleted, variant: "success" });
    } catch (cause) {
      const message = String(cause); setError(message);
      toast.show({ title: copy.deleteFailed, description: message, variant: "error" });
      throw cause;
    } finally { setBusy(false); }
  };
  const openTestAccount = () => auth.requireAuth(async () => {
    setBusy(true); setError(null);
    try {
      const suggestion = await window.getgo.suggestGetGoUpgradeTestEmail();
      setTestAccount({ email: suggestion.email, password: "", scenario: "matched-topics", projectId: suggestion.projectId });
    } catch (cause) {
      const message = String(cause); setError(message);
      toast.show({ title: copy.testCreateFailed, description: message, variant: "error" });
    } finally { setBusy(false); }
  });
  const createTestAccount = (event: FormEvent) => auth.requireAuth(async () => {
    event.preventDefault();
    if (!testAccount) return;
    setBusy(true); setError(null);
    try {
      const created = await window.getgo.createGetGoUpgradeTestAccount(testAccount.email, testAccount.password, testAccount.scenario);
      setTestAccount(null); setSearch(created.email); setRefresh(value => value + 1);
      toast.show({ title: copy.testCreated, description: created.email, variant: "success" });
    } catch (cause) {
      const message = String(cause); setError(message);
      toast.show({ title: copy.testCreateFailed, description: message, variant: "error" });
    } finally { setBusy(false); }
  });
  const unchanged = editing?.membership === membership
    && dateInputValue(editing.subscriptionStartsAt) === (membership === "premium" ? startsAt : "")
    && dateInputValue(editing.subscriptionExpiresAt) === (membership === "premium" ? expiresAt : "");

  if (result === null && loading && !error) return <ui.PageLoading label={copy.loading} />;
  return <section className="manager members-page">
    <ui.PageHeader eyebrow={copy.eyebrow} title={copy.title} description={copy.description} actions={<>
      <ui.ControlGroup className="manager-topic-header-controls">
        <ui.SearchField className="members-header-search ui-page-header-control" value={search} placeholder={copy.search} ariaLabel={copy.search} clearLabel={copy.clear} onValueChange={setSearch} />
        <ui.Select
          className="manager-topic-filter"
          value={filter}
          options={(["all", "free", "premium", "admin"] as MemberFilter[]).map(value => ({ value, label: copy[value] }))}
          ariaLabel={copy.membership}
          onValueChange={value => { setFilter(value as MemberFilter); setPage(1); setCursors([null]); }}
        />
      </ui.ControlGroup>
      {environment === "development" && <ui.Button variant="primary" icon={<Plus />} loading={busy && !testAccount} onClick={() => void openTestAccount()}>{copy.addTest}</ui.Button>}
      <ui.Button icon={<RefreshCw />} loading={loading} onClick={() => setRefresh(value => value + 1)}>{copy.refresh}</ui.Button>
    </>} />
    {error && !editing && <ui.ErrorFrame message={error} />}
    <ui.DataTable horizontalScroll rows={result?.items ?? []} columns={columns} rowKey={item => item.id} ariaLabel={copy.title} emptyText={copy.empty} />
    <div className="members-table-footer">
      <span>{copy.pageSize}</span>
      <ui.Pagination
        locale={locale}
        page={page}
        hasNextPage={Boolean(result?.nextCursor)}
        disabled={loading}
        onPageChange={nextPage => {
          if (nextPage > page) {
            if (!result?.nextCursor) return;
            setCursors(current => [...current.slice(0, page), result.nextCursor]);
          }
          setPage(nextPage);
        }}
      />
    </div>
    {editing && <ui.DialogFrame presentation="modal" title={copy.edit} busy={busy} error={error} cancelLabel={copy.cancel} submitLabel={copy.save} submitDisabled={Boolean(unchanged)} processingLabel={copy.deleting} onClose={() => !busy && setEditing(null)} onSubmit={save} leadingAction={<ui.ConfirmPopover label={copy.delete} description={copy.deleteConfirm} triggerLabel={copy.delete} confirmLabel={copy.deleteConfirmAction} cancelLabel={copy.cancel} busy={busy} onConfirm={remove} />}>
      <ui.Form fields={[
        { type: "custom", name: "member", label: copy.name, render: () => <div><strong>{editing.name}</strong><div>{editing.email}</div><small>{editing.id}</small></div> },
        { type: "select", name: "membership", label: copy.membership, required: true, presentation: "segmented", options: (["free", "premium", "admin"] as GetGoMembershipTier[]).map(value => ({ value, label: membershipLabel(value) })) },
        [{ type: "date", name: "startsAt", label: copy.starts, when: values => values.membership === "premium" }, { type: "date", name: "expiresAt", label: copy.expires, when: values => values.membership === "premium" }],
        { type: "custom", name: "notice", render: () => <p>{copy.confirm}</p> },
      ]} values={{ member: editing.id, membership, startsAt, expiresAt, notice: "" }} onChange={(name, value) => { if (name === "membership") changeMembership(value as GetGoMembershipTier); if (name === "startsAt") setStartsAt(String(value)); if (name === "expiresAt") setExpiresAt(String(value)); }} />
    </ui.DialogFrame>}
    {testAccount && <ui.DialogFrame presentation="modal" title={copy.addTest} busy={busy} error={error} cancelLabel={copy.cancel} submitLabel={copy.createTest} submitDisabled={!/^test[1-9]\d*@tnp\.com\.vn$/.test(testAccount.email) || testAccount.password.length < 8} onClose={() => !busy && setTestAccount(null)} onSubmit={createTestAccount}>
      <ui.Form fields={[
        { type: "email", name: "email", label: copy.email, required: true, autoComplete: "off", rules: { pattern: { value: /^test[1-9]\d*@tnp\.com\.vn$/, message: "test1@tnp.com.vn" } } },
        { type: "password", name: "password", label: copy.testPassword, helper: copy.passwordHelp, required: true, autoComplete: "new-password", rules: { minLength: 8 } },
        { type: "select", name: "scenario", label: copy.testScenario, required: true, presentation: "segmented", options: [
          { value: "matched-topics", label: copy.matchedTopics },
          { value: "manual-topics", label: copy.manualTopics },
        ] },
        { type: "custom", name: "notice", render: () => <p>{copy.testHelp}<br /><small>{testAccount.projectId}</small></p> },
      ]} values={{ ...testAccount, notice: "" }} onChange={(name, value) => setTestAccount(current => current ? { ...current, [name]: value } as TestAccountDraft : current)} />
    </ui.DialogFrame>}
  </section>;
}
