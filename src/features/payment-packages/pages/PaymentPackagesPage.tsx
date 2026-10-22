import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Pencil, Plus, RefreshCw } from "lucide-react";
import type { AppSettings, PaymentEvent, PaymentPackage } from "../../../shared/domain/models";
import { useAuth } from "../../authentication/components/AuthContext";
import * as ui from "../../../shared/ui";
import { PaymentPackagesPreview } from "../components/PaymentPackagesPreview";
import { PaymentEventsManager } from "../components/PaymentEventsManager";
import { VietQrConfigurationPanel } from "../components/VietQrConfigurationPanel";
import { BillingOrdersPage } from "../../payment-orders/components/BillingOrdersPage";
import { PaymentReviewsPage } from "../../payment-orders/components/PaymentReviewsPage";
import type { GetGoAccessPolicy } from "../domain/access-policy";
import { paymentTargetEnvironments } from "../domain/payment-environment";
import en from "../../../shared/localization/en.json";
import vi from "../../../shared/localization/vi.json";

const emptyPackage = (): PaymentPackage => ({ id: "", platform: "web", targetEnvironments: [...paymentTargetEnvironments], name: { en: "", vi: "" }, type: "monthly", info: { en: "", vi: "" }, benefits: { en: [], vi: [] }, price: { amount: 0, currency: "VND" } });
const benefitLines = (items: string[]) => items.join("\n");
const benefitsFromLines = (value: unknown) => String(value ?? "").split("\n").map(item => item.trim()).filter(Boolean);

type PaymentsTab = "packages" | "events" | "orders" | "reviews" | "preview" | "configuration";
const tabFromRoute = (route: string): PaymentsTab => {
  try { const value = new URL(route, "app://getgo").searchParams.get("tab"); return value === "preview" || value === "events" || value === "orders" || value === "reviews" || value === "configuration" || value === "sales" ? (value === "sales" ? "events" : value) : "packages"; }
  catch { return "packages"; }
};
const orderFromRoute = (route: string): string | null => {
  try { return new URL(route, "app://getgo").searchParams.get("order"); }
  catch { return null; }
};

export function PaymentPackagesPage({ locale, environment, initialRoute, onRouteChange }: { locale: AppSettings["locale"]; environment: AppSettings["environment"]; initialRoute: string; onRouteChange(route: string): void }) {
  const isVi = locale === "vi";
  const paymentCopy = (isVi ? vi : en).payments;
  const auth = useAuth();
  const toast = ui.useToast();
  const [items, setItems] = useState<PaymentPackage[] | null>(null);
  const [draft, setDraft] = useState<PaymentPackage | null>(null);
  const [originalId, setOriginalId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<PaymentsTab>(() => tabFromRoute(initialRoute));
  const [selectedBillingOrderId, setSelectedBillingOrderId] = useState<string | null>(() =>
    orderFromRoute(initialRoute),
  );
  const [previewLocale, setPreviewLocale] = useState<AppSettings["locale"]>(locale);
  const [previewEvents, setPreviewEvents] = useState<PaymentEvent[] | null>(null);
  const [previewAccessPolicy, setPreviewAccessPolicy] = useState<GetGoAccessPolicy | null>(null);
  const [previewSaleId, setPreviewSaleId] = useState("");
  const [previewPlatform, setPreviewPlatform] = useState<PaymentPackage["platform"]>("web");
  const [platformFilter, setPlatformFilter] = useState<PaymentPackage["platform"] | "all">("all");
  const [environmentFilter, setEnvironmentFilter] = useState<AppSettings["environment"] | "all">("all");
  useEffect(() => {
    const nextTab = tabFromRoute(initialRoute);
    setTab(nextTab);
    setSelectedBillingOrderId(orderFromRoute(initialRoute));
  }, [initialRoute]);
  useEffect(() => {
    if (tab !== "preview" || (previewEvents !== null && previewAccessPolicy !== null)) return;
    void Promise.all([window.getgo.listPaymentEvents(), window.getgo.loadGetGoAccessPolicy()])
      .then(([events, accessPolicy]) => { setPreviewEvents(events); setPreviewAccessPolicy(accessPolicy); })
      .catch((error) => toast.show({ title: isVi ? "Không thể tải bản xem trước" : "Could not load preview", description: String(error), variant: "error" }));
  }, [isVi, previewAccessPolicy, previewEvents, tab, toast]);
  const [eventCreateRequest, setEventCreateRequest] = useState(0);
  const changeTab = (value: PaymentsTab) => {
    setTab(value);
    onRouteChange(`/payments?tab=${value}`);
  };
  const selectBillingOrder = (orderId: string | null) => {
    setSelectedBillingOrderId(orderId);
    onRouteChange(`/payments?tab=orders${orderId ? `&order=${encodeURIComponent(orderId)}` : ""}`);
  };
  const text = isVi ? { title: "Thanh toán", description: "Quản lý gói thành viên, sự kiện và đồng bộ với Firestore.", packages: "Gói", events: "Sự kiện", orders: "Đơn hàng", reviews: "Yêu cầu kiểm tra", preview: "Xem trước", configuration: "Cấu hình", add: "Thêm gói", addEvent: "Thêm sự kiện", sync: "Đồng bộ", name: "Tên", platform: "Nền tảng", storeProductId: "Mã sản phẩm cửa hàng", storeProductIdHelp: "Mã sản phẩm trong App Store Connect hoặc Google Play Console.", type: "Loại", info: "Thông tin", benefits: "Quyền lợi", benefitsHelp: "Mỗi dòng là một quyền lợi hiển thị trên gói.", price: "Giá", save: "Lưu", create: "Tạo", cancel: "Hủy" } : { title: "Payments", description: "Manage membership packages, events, and Firestore synchronization.", packages: "Packages", events: "Events", orders: "Orders", reviews: "Reviews", preview: "Preview", configuration: "Configuration", add: "Add package", addEvent: "Add event", sync: "Sync", name: "Name", platform: "Platform", storeProductId: "Store product ID", storeProductIdHelp: "The product ID in App Store Connect or Google Play Console.", type: "Type", info: "Information", benefits: "Benefits", benefitsHelp: "Enter one displayed benefit per line.", price: "Price", save: "Save", create: "Create", cancel: "Cancel" };
  useEffect(() => { void window.getgo.listPaymentPackages().then(setItems).catch((error) => toast.show({ title: text.title, description: String(error), variant: "error" })); }, []);
  const fields = useMemo<ui.FormSchema[]>(() => [
    [{ type: "text", name: "id", label: "ID", required: true, readOnly: originalId !== null }, { type: "text", name: "nameVi", label: `${text.name} (VI)`, required: true }, { type: "text", name: "nameEn", label: `${text.name} (EN)`, required: true }],
    { type: "select", name: "platform", label: text.platform, options: [{ value: "web", label: "Web" }, { value: "ios", label: "iOS (iPhone/iPad)" }, { value: "android", label: "Android" }] },
    ...(draft?.platform === "web" ? [] : [{ type: "text", name: "storeProductId", label: text.storeProductId, helper: text.storeProductIdHelp, required: true } as ui.FormSchema]),
    ...(draft?.platform === "android" ? [{ type: "text", name: "storeBasePlanId", label: isVi ? "Mã gói cơ sở Google Play" : "Google Play base plan ID", required: true } as ui.FormSchema] : []),
    { type: "select", name: "type", label: text.type, options: [{ value: "free", label: isVi ? "Miễn phí" : "Free" }, { value: "monthly", label: isVi ? "Hàng tháng" : "Monthly" }, { value: "annual", label: isVi ? "Hàng năm" : "Annual" }, { value: "one-time", label: isVi ? "Một lần" : "One-time" }] },
    { type: "multi-select", name: "targetEnvironments", label: paymentCopy.targetEnvironments, required: true, requiredMessage: paymentCopy.targetEnvironmentsRequired, options: paymentTargetEnvironments.map((value) => ({ value, label: paymentCopy.environments[value] })) },
    [{ type: "textarea", name: "infoVi", label: `${text.info} (VI)` }, { type: "textarea", name: "infoEn", label: `${text.info} (EN)` }],
    [{ type: "textarea", name: "benefitsVi", label: `${text.benefits} (VI)`, helper: text.benefitsHelp, rows: 5 }, { type: "textarea", name: "benefitsEn", label: `${text.benefits} (EN)`, helper: text.benefitsHelp, rows: 5 }],
    [{ type: "number", name: "amount", label: text.price, min: 0 }, { type: "text", name: "currency", label: isVi ? "Tiền tệ" : "Currency" }],
  ], [draft?.platform, isVi, originalId, paymentCopy, text]);
  const save = async (event: FormEvent) => { event.preventDefault(); if (!draft || !items) return; if (!draft.targetEnvironments.length) { toast.show({ title: paymentCopy.targetEnvironmentsRequired, variant: "error" }); return; } setBusy(true); try { const next = [...items.filter((item) => item.id !== originalId), draft].sort((a, b) => a.name[locale].localeCompare(b.name[locale])); const saved = await window.getgo.savePaymentPackages(next); const canonical = saved.find((item) => item.id === draft.id) ?? draft; setItems((current) => current ? (originalId ? current.map((item) => item.id === originalId ? canonical : item) : [...current, canonical].sort((a, b) => a.name[locale].localeCompare(b.name[locale]))) : current); setDraft(null); toast.show({ title: isVi ? "Đã lưu gói" : "Package saved", variant: "success" }); } catch (error) { toast.show({ title: isVi ? "Không thể lưu" : "Save failed", description: String(error), variant: "error" }); } finally { setBusy(false); } };
  const sync = () => auth.requireAuth(async () => { setBusy(true); try { const result = await window.getgo.syncPaymentPackages(); toast.show({ title: isVi ? "Đã đồng bộ" : "Packages synchronized", description: `${result.count} ${isVi ? "gói" : "packages"} · ${paymentCopy.environments[environment]}`, variant: "success" }); } catch (error) { toast.show({ title: isVi ? "Đồng bộ thất bại" : "Sync failed", description: String(error), variant: "error" }); } finally { setBusy(false); } });
  const syncEvents = () => auth.requireAuth(async () => { setBusy(true); try { const result = await window.getgo.syncPaymentEvents(); const stores = result.nativeOffers.apple + result.nativeOffers.google; const details = [`${result.count} ${isVi ? "sự kiện" : "events"}`, `${stores} ${isVi ? "ưu đãi cửa hàng" : "store offers"}`, paymentCopy.environments[environment], ...result.nativeOffers.skipped].join(" · "); toast.show({ title: isVi ? "Đã đồng bộ sự kiện" : "Events synchronized", description: details, variant: result.nativeOffers.skipped.length ? "info" : "success" }); } catch (error) { toast.show({ title: isVi ? "Đồng bộ thất bại" : "Sync failed", description: String(error), variant: "error" }); } finally { setBusy(false); } });
  const remove = async () => { if (!originalId || !items) return; setBusy(true); try { await window.getgo.savePaymentPackages(items.filter((item) => item.id !== originalId)); setItems((current) => current?.filter((item) => item.id !== originalId) ?? current); setDraft(null); toast.show({ title: isVi ? "Đã xóa gói" : "Package deleted", variant: "success" }); } finally { setBusy(false); } };
  const columns = useMemo<ui.DataColumn<PaymentPackage>[]>(() => [
    { key: "name", title: text.name, render: (item) => <strong>{item.name[locale]}</strong> }, { key: "type", title: text.type, render: (item) => item.type },
    { key: "platform", title: text.platform, render: (item) => item.platform === "ios" ? "iOS" : item.platform === "android" ? "Android" : "Web" },
    { key: "environments", title: paymentCopy.targetEnvironments, render: (item) => item.targetEnvironments.map((value) => paymentCopy.environments[value]).join(", ") },
    { key: "info", title: text.info, render: (item) => item.info[locale] || "—" },
    { key: "benefits", title: text.benefits, render: (item) => item.benefits[locale].length || "—" },
    { key: "price", title: text.price, render: (item) => `${item.price.amount.toLocaleString()} ${item.price.currency}` },
    { key: "actions", title: "", role: "actions", width: 56, render: (item) => <ui.TableActionButton icon={<Pencil />} aria-label={text.save} onClick={() => { setOriginalId(item.id); setDraft(structuredClone(item)); }} /> },
  ], [locale, paymentCopy, text]);
  const previewSaleOptions = useMemo(() => [
    { value: "", label: previewLocale === "vi" ? "Không áp dụng khuyến mãi" : "No sale event" },
    ...(previewEvents ?? []).filter((event): event is Extract<PaymentEvent, { type: "sale" }> => event.type === "sale" && event.targetEnvironments.includes(environment)).map((sale) => ({
      value: sale.id,
      label: `${sale.name[previewLocale]} · -${sale.discountPercent}%${sale.enabled ? "" : ` (${previewLocale === "vi" ? "đã tắt" : "disabled"})`}`,
    })),
  ], [environment, previewEvents, previewLocale]);
  const previewSale = previewEvents?.find((event): event is Extract<PaymentEvent, { type: "sale" }> => event.id === previewSaleId && event.type === "sale");
  const syncLabel = paymentCopy.syncTo.replace("{environment}", paymentCopy.environments[environment]);
  const filteredItems = useMemo(() => items?.filter((item) =>
    (platformFilter === "all" || item.platform === platformFilter)
    && (environmentFilter === "all" || item.targetEnvironments.includes(environmentFilter)),
  ) ?? [], [environmentFilter, items, platformFilter]);
  const actions = tab === "packages" ? <ui.ActionMenu label={paymentCopy.actions} variant="primary" disabled={busy} items={[
    { id: "add-package", label: text.add, icon: Plus, onSelect: () => { setOriginalId(null); setDraft(emptyPackage()); } },
    { id: "sync-packages", label: syncLabel, icon: RefreshCw, onSelect: sync },
  ]} /> : tab === "events" ? <ui.ActionMenu label={paymentCopy.actions} variant="primary" disabled={busy} items={[
    { id: "add-event", label: text.addEvent, icon: Plus, onSelect: () => setEventCreateRequest((value) => value + 1) },
    { id: "sync-events", label: syncLabel, icon: RefreshCw, onSelect: syncEvents },
  ]} /> : undefined;
  if (items === null) return <ui.PageLoading label={isVi ? "Đang tải trang" : "Loading page"} />;
  return <section><ui.PageHeader eyebrow="Billing" title={text.title} description={text.description} actions={actions} />
    <ui.Tabs<PaymentsTab> className="contest-detail-tabs" items={[{ id: "packages", label: text.packages }, { id: "events", label: text.events }, { id: "orders", label: text.orders }, { id: "reviews", label: text.reviews }, { id: "preview", label: text.preview }, { id: "configuration", label: text.configuration }]} value={tab} onChange={changeTab} ariaLabel={text.title} variant="underline" />
    <ui.TabPanels<PaymentsTab> value={tab} items={[
      { id: "packages", content: <div className="payment-package-list"><ui.ControlGroup className="payment-package-filters"><ui.Select value={platformFilter} ariaLabel={paymentCopy.filterPlatform} options={[{ value: "all", label: paymentCopy.allPlatforms }, { value: "web", label: "Web" }, { value: "ios", label: "iOS" }, { value: "android", label: "Android" }]} onValueChange={(value) => setPlatformFilter(value as PaymentPackage["platform"] | "all")} /><ui.Select value={environmentFilter} ariaLabel={paymentCopy.filterEnvironment} options={[{ value: "all", label: paymentCopy.allEnvironments }, ...paymentTargetEnvironments.map((value) => ({ value, label: paymentCopy.environments[value] }))]} onValueChange={(value) => setEnvironmentFilter(value as AppSettings["environment"] | "all")} /></ui.ControlGroup><ui.DataTable rows={filteredItems} columns={columns} rowKey={(item) => item.id} ariaLabel={text.title} emptyText={items.length ? paymentCopy.noMatchingPackages : (isVi ? "Chưa có gói thanh toán." : "No payment packages.")} /></div> },
      { id: "events", content: <PaymentEventsManager locale={locale} packages={items} createRequest={eventCreateRequest} onCreateRequestHandled={() => setEventCreateRequest(0)} /> },
      { id: "orders", content: <BillingOrdersPage locale={locale} selectedOrderId={selectedBillingOrderId} onSelectedOrderChange={selectBillingOrder} /> },
      { id: "reviews", content: <PaymentReviewsPage locale={locale} /> },
      { id: "preview", content: previewEvents === null || previewAccessPolicy === null ? <ui.PageLoading label={isVi ? "Đang tải bản xem trước" : "Loading preview"} /> : <div className="payment-package-preview-section"><div className="payment-package-preview-toolbar"><ui.Select value={previewSaleId} options={previewSaleOptions} onValueChange={setPreviewSaleId} /><ui.SegmentedControl value={previewPlatform} options={[{ value: "web", label: "Web" }, { value: "ios", label: "iOS" }, { value: "android", label: "Android" }]} ariaLabel={text.platform} onValueChange={(value) => setPreviewPlatform(value as PaymentPackage["platform"])} /><ui.SegmentedControl value={previewLocale} options={[{ value: "vi", label: "Tiếng Việt" }, { value: "en", label: "English" }]} ariaLabel={isVi ? "Ngôn ngữ xem trước" : "Preview language"} onValueChange={(value) => setPreviewLocale(value as AppSettings["locale"])} /></div><PaymentPackagesPreview items={items.filter(item => item.platform === previewPlatform && item.targetEnvironments.includes(environment))} locale={previewLocale} sale={previewSale} accessPolicy={previewAccessPolicy} /></div> },
      { id: "configuration", content: <VietQrConfigurationPanel locale={locale} environment={environment} /> },
    ]} />
    {draft && <ui.DialogFrame title={originalId ? text.save : text.create} busy={busy} error={null} cancelLabel={text.cancel} submitLabel={originalId ? text.save : text.create} onClose={() => setDraft(null)} onSubmit={save} onDelete={originalId ? remove : undefined} deleteLabel={isVi ? "Xóa" : "Delete"} deleteConfirmText={isVi ? "Xóa gói thanh toán này?" : "Delete this payment package?"}><ui.Form fields={fields} values={{ ...draft, nameVi: draft.name.vi, nameEn: draft.name.en, infoVi: draft.info.vi, infoEn: draft.info.en, benefitsVi: benefitLines(draft.benefits.vi), benefitsEn: benefitLines(draft.benefits.en), amount: draft.price.amount, currency: draft.price.currency }} onChange={(name, value) => setDraft((current) => { if (!current) return current; if (name === "amount" || name === "currency") return { ...current, price: { ...current.price, [name]: value } }; const benefitMatch = /^benefits(Vi|En)$/.exec(name); if (benefitMatch) { const language = benefitMatch[1].toLowerCase() as "vi" | "en"; return { ...current, benefits: { ...current.benefits, [language]: benefitsFromLines(value) } }; } const match = /^(name|info)(Vi|En)$/.exec(name); if (!match) { if (name === "platform" && value === "web") { const { storeProductId: _storeProductId, ...rest } = current; return { ...rest, platform: "web" }; } return { ...current, [name]: value }; } const key = match[1] as "name" | "info"; const language = match[2].toLowerCase() as "vi" | "en"; return { ...current, [key]: { ...current[key], [language]: String(value ?? "") } }; })} /></ui.DialogFrame>}
  </section>;
}
