import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Pencil, Plus, RefreshCw } from "lucide-react";
import type { AppSettings, PaymentPackage, PaymentSale } from "../../../shared/domain/models";
import { useAuth } from "../../authentication/components/AuthContext";
import * as ui from "../../../shared/ui";
import { PaymentPackagesPreview } from "../components/PaymentPackagesPreview";
import { PaymentSalesManager } from "../components/PaymentSalesManager";

const emptyPackage = (): PaymentPackage => ({ id: "", name: { en: "", vi: "" }, type: "monthly", info: { en: "", vi: "" }, benefits: { en: [], vi: [] }, price: { amount: 0, currency: "VND" } });
const toLines = (value: unknown) => String(value ?? "").split("\n").map((item) => item.trim()).filter(Boolean);

type PaymentsTab = "packages" | "sales" | "preview";
const tabFromRoute = (route: string): PaymentsTab => {
  try { const value = new URL(route, "app://getgo").searchParams.get("tab"); return value === "preview" || value === "sales" ? value : "packages"; }
  catch { return "packages"; }
};

export function PaymentPackagesPage({ locale, initialRoute, onRouteChange }: { locale: AppSettings["locale"]; initialRoute: string; onRouteChange(route: string): void }) {
  const isVi = locale === "vi";
  const auth = useAuth();
  const toast = ui.useToast();
  const [items, setItems] = useState<PaymentPackage[] | null>(null);
  const [draft, setDraft] = useState<PaymentPackage | null>(null);
  const [originalId, setOriginalId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<PaymentsTab>(() => tabFromRoute(initialRoute));
  const [previewLocale, setPreviewLocale] = useState<AppSettings["locale"]>(locale);
  const [previewSales, setPreviewSales] = useState<PaymentSale[] | null>(null);
  const [previewSaleId, setPreviewSaleId] = useState("");
  useEffect(() => {
    const nextTab = tabFromRoute(initialRoute);
    setTab(nextTab);
  }, [initialRoute]);
  useEffect(() => {
    if (tab !== "preview" || previewSales !== null) return;
    void window.getgo.listPaymentSales().then(setPreviewSales);
  }, [previewSales, tab]);
  const [saleCreateRequest, setSaleCreateRequest] = useState(0);
  const changeTab = (value: PaymentsTab) => {
    setTab(value);
    onRouteChange(`/payments?tab=${value}`);
  };
  const text = isVi ? { title: "Thanh toán", description: "Quản lý gói thành viên, khuyến mãi và đồng bộ với Firestore.", packages: "Gói", sales: "Khuyến mãi", preview: "Xem trước", add: "Thêm gói", addSale: "Thêm khuyến mãi", sync: "Đồng bộ", name: "Tên", type: "Loại", info: "Thông tin", benefits: "Quyền lợi", price: "Giá", save: "Lưu", create: "Tạo", cancel: "Hủy" } : { title: "Payments", description: "Manage membership packages, sales, and Firestore synchronization.", packages: "Packages", sales: "Sales", preview: "Preview", add: "Add package", addSale: "Add sale", sync: "Sync", name: "Name", type: "Type", info: "Information", benefits: "Benefits", price: "Price", save: "Save", create: "Create", cancel: "Cancel" };
  useEffect(() => { void window.getgo.listPaymentPackages().then(setItems).catch((error) => toast.show({ title: text.title, description: String(error), variant: "error" })); }, []);
  const fields = useMemo<ui.FormSchema[]>(() => [
    [{ type: "text", name: "id", label: "ID", required: true, readOnly: originalId !== null }, { type: "text", name: "nameVi", label: `${text.name} (VI)`, required: true }, { type: "text", name: "nameEn", label: `${text.name} (EN)`, required: true }],
    { type: "select", name: "type", label: text.type, options: [{ value: "free", label: isVi ? "Miễn phí" : "Free" }, { value: "monthly", label: isVi ? "Hàng tháng" : "Monthly" }, { value: "annual", label: isVi ? "Hàng năm" : "Annual" }, { value: "one-time", label: isVi ? "Một lần" : "One-time" }] },
    [{ type: "textarea", name: "infoVi", label: `${text.info} (VI)` }, { type: "textarea", name: "infoEn", label: `${text.info} (EN)` }],
    [{ type: "textarea", name: "benefitsVi", label: `${text.benefits} (VI)`, helper: "Mỗi quyền lợi một dòng" }, { type: "textarea", name: "benefitsEn", label: `${text.benefits} (EN)`, helper: "One benefit per line" }],
    [{ type: "number", name: "amount", label: text.price, min: 0 }, { type: "text", name: "currency", label: isVi ? "Tiền tệ" : "Currency" }],
  ], [isVi, originalId, text]);
  const save = async (event: FormEvent) => { event.preventDefault(); if (!draft || !items) return; setBusy(true); try { const next = [...items.filter((item) => item.id !== originalId), draft].sort((a, b) => a.name[locale].localeCompare(b.name[locale])); const saved = await window.getgo.savePaymentPackages(next); const canonical = saved.find((item) => item.id === draft.id) ?? draft; setItems((current) => current ? (originalId ? current.map((item) => item.id === originalId ? canonical : item) : [...current, canonical].sort((a, b) => a.name[locale].localeCompare(b.name[locale]))) : current); setDraft(null); toast.show({ title: isVi ? "Đã lưu gói" : "Package saved", variant: "success" }); } catch (error) { toast.show({ title: isVi ? "Không thể lưu" : "Save failed", description: String(error), variant: "error" }); } finally { setBusy(false); } };
  const sync = () => auth.requireAuth(async () => { setBusy(true); try { const result = await window.getgo.syncPaymentPackages(); toast.show({ title: isVi ? "Đã đồng bộ" : "Packages synchronized", description: `${result.count} ${isVi ? "gói" : "packages"}`, variant: "success" }); } catch (error) { toast.show({ title: isVi ? "Đồng bộ thất bại" : "Sync failed", description: String(error), variant: "error" }); } finally { setBusy(false); } });
  const syncSales = () => auth.requireAuth(async () => { setBusy(true); try { const result = await window.getgo.syncPaymentSales(); toast.show({ title: isVi ? "Đã đồng bộ khuyến mãi" : "Sales synchronized", description: `${result.count} ${isVi ? "sự kiện" : "events"}`, variant: "success" }); } catch (error) { toast.show({ title: isVi ? "Đồng bộ thất bại" : "Sync failed", description: String(error), variant: "error" }); } finally { setBusy(false); } });
  const remove = async () => { if (!originalId || !items) return; setBusy(true); try { await window.getgo.savePaymentPackages(items.filter((item) => item.id !== originalId)); setItems((current) => current?.filter((item) => item.id !== originalId) ?? current); setDraft(null); toast.show({ title: isVi ? "Đã xóa gói" : "Package deleted", variant: "success" }); } finally { setBusy(false); } };
  const columns = useMemo<ui.DataColumn<PaymentPackage>[]>(() => [
    { key: "name", title: text.name, render: (item) => <strong>{item.name[locale]}</strong> }, { key: "type", title: text.type, render: (item) => item.type },
    { key: "info", title: text.info, render: (item) => item.info[locale] || "—" }, { key: "benefits", title: text.benefits, render: (item) => item.benefits[locale].join(", ") || "—" },
    { key: "price", title: text.price, render: (item) => `${item.price.amount.toLocaleString()} ${item.price.currency}` },
    { key: "actions", title: "", role: "actions", width: 56, render: (item) => <ui.TableActionButton icon={<Pencil />} aria-label={text.save} onClick={() => { setOriginalId(item.id); setDraft(structuredClone(item)); }} /> },
  ], [locale, text]);
  const previewSaleOptions = useMemo(() => [
    { value: "", label: previewLocale === "vi" ? "Không áp dụng khuyến mãi" : "No sale event" },
    ...(previewSales ?? []).map((sale) => ({
      value: sale.id,
      label: `${sale.name[previewLocale]} · -${sale.discountPercent}%${sale.enabled ? "" : ` (${previewLocale === "vi" ? "đã tắt" : "disabled"})`}`,
    })),
  ], [previewLocale, previewSales]);
  const actions = tab === "packages" ? <ui.ControlGroup><ui.Button icon={<Plus />} onClick={() => { setOriginalId(null); setDraft(emptyPackage()); }}>{text.add}</ui.Button><ui.Button icon={<RefreshCw />} loading={busy} onClick={sync}>{text.sync}</ui.Button></ui.ControlGroup> : tab === "sales" ? <ui.ControlGroup><ui.Button icon={<Plus />} onClick={() => setSaleCreateRequest((value) => value + 1)}>{text.addSale}</ui.Button><ui.Button icon={<RefreshCw />} loading={busy} onClick={syncSales}>{text.sync}</ui.Button></ui.ControlGroup> : undefined;
  if (items === null) return <ui.PageLoading label={isVi ? "Đang tải trang" : "Loading page"} />;
  return <section><ui.PageHeader eyebrow="Billing" title={text.title} description={text.description} actions={actions} />
    <ui.Tabs<PaymentsTab> className="contest-detail-tabs" items={[{ id: "packages", label: text.packages }, { id: "sales", label: text.sales }, { id: "preview", label: text.preview }]} value={tab} onChange={changeTab} ariaLabel={text.title} variant="underline" />
    <ui.TabPanels<PaymentsTab> value={tab} items={[
      { id: "packages", content: <ui.DataTable rows={items} columns={columns} rowKey={(item) => item.id} ariaLabel={text.title} emptyText={isVi ? "Chưa có gói thanh toán." : "No payment packages."} /> },
      { id: "sales", content: <PaymentSalesManager locale={locale} packages={items} createRequest={saleCreateRequest} onCreateRequestHandled={() => setSaleCreateRequest(0)} /> },
      { id: "preview", content: previewSales === null ? <ui.PageLoading label={isVi ? "Đang tải bản xem trước" : "Loading preview"} /> : <div className="payment-package-preview-section"><div className="payment-package-preview-toolbar"><ui.Select value={previewSaleId} options={previewSaleOptions} onValueChange={setPreviewSaleId} /><ui.SegmentedControl value={previewLocale} options={[{ value: "vi", label: "Tiếng Việt" }, { value: "en", label: "English" }]} ariaLabel={isVi ? "Ngôn ngữ xem trước" : "Preview language"} onValueChange={(value) => setPreviewLocale(value as AppSettings["locale"])} /></div><PaymentPackagesPreview items={items} locale={previewLocale} sale={previewSales.find((sale) => sale.id === previewSaleId)} /></div> },
    ]} />
    {draft && <ui.DialogFrame title={originalId ? text.save : text.create} busy={busy} error={null} cancelLabel={text.cancel} submitLabel={originalId ? text.save : text.create} onClose={() => setDraft(null)} onSubmit={save} onDelete={originalId ? remove : undefined} deleteLabel={isVi ? "Xóa" : "Delete"} deleteConfirmText={isVi ? "Xóa gói thanh toán này?" : "Delete this payment package?"}><ui.Form fields={fields} values={{ ...draft, nameVi: draft.name.vi, nameEn: draft.name.en, infoVi: draft.info.vi, infoEn: draft.info.en, benefitsVi: draft.benefits.vi.join("\n"), benefitsEn: draft.benefits.en.join("\n"), amount: draft.price.amount, currency: draft.price.currency }} onChange={(name, value) => setDraft((current) => { if (!current) return current; if (name === "amount" || name === "currency") return { ...current, price: { ...current.price, [name]: value } }; const match = /^(name|info|benefits)(Vi|En)$/.exec(name); if (!match) return { ...current, [name]: value }; const key = match[1] as "name" | "info" | "benefits"; const language = match[2].toLowerCase() as "vi" | "en"; return { ...current, [key]: { ...current[key], [language]: key === "benefits" ? toLines(value) : String(value ?? "") } }; })} /></ui.DialogFrame>}
  </section>;
}
