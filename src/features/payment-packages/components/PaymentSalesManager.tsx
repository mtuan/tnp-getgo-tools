import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Pencil } from "lucide-react";
import type { AppSettings, PaymentPackage, PaymentSale } from "../../../shared/domain/models";
import * as ui from "../../../shared/ui";

const today = () => new Date().toISOString().slice(0, 10);
const emptySale = (): PaymentSale => ({ id: "", name: { en: "", vi: "" }, info: { en: "", vi: "" }, recurrence: "one-time", startsOn: today(), endsOn: today(), discountPercent: 10, packageIds: [], enabled: true });

export function PaymentSalesManager({ locale, packages, createRequest, onCreateRequestHandled }: { locale: AppSettings["locale"]; packages: PaymentPackage[]; createRequest: number; onCreateRequestHandled(): void }) {
  const isVi = locale === "vi";
  const toast = ui.useToast();
  const [sales, setSales] = useState<PaymentSale[] | null>(null);
  const [draft, setDraft] = useState<PaymentSale | null>(null);
  const [originalId, setOriginalId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { void window.getgo.listPaymentSales().then(setSales).catch((error) => toast.show({ title: isVi ? "Không thể tải khuyến mãi" : "Could not load sales", description: String(error), variant: "error" })); }, []);
  useEffect(() => { if (!createRequest) return; setOriginalId(null); setDraft(emptySale()); onCreateRequestHandled(); }, [createRequest, onCreateRequestHandled]);
  const fields = useMemo<ui.FormSchema[]>(() => [
    [{ type: "text", name: "id", label: "ID", required: true, readOnly: originalId !== null }, { type: "toggle", name: "enabled", label: isVi ? "Đang bật" : "Enabled", presentation: "row" }],
    [{ type: "text", name: "nameVi", label: "Tên (VI)", required: true }, { type: "text", name: "nameEn", label: "Name (EN)", required: true }],
    [{ type: "textarea", name: "infoVi", label: "Thông tin (VI)" }, { type: "textarea", name: "infoEn", label: "Information (EN)" }],
    [{ type: "select", name: "recurrence", label: isVi ? "Lặp lại" : "Recurrence", options: [{ value: "one-time", label: isVi ? "Một lần" : "One-time" }, { value: "yearly", label: isVi ? "Hàng năm" : "Yearly" }] }, { type: "date", name: "startsOn", label: isVi ? "Bắt đầu" : "Starts on", required: true }, { type: "date", name: "endsOn", label: isVi ? "Kết thúc" : "Ends on", required: true }, { type: "number", name: "discountPercent", label: isVi ? "Giảm giá (%)" : "Discount (%)", min: 1, max: 100 }],
    { type: "multi-select", name: "packageIds", label: isVi ? "Áp dụng cho các gói" : "Eligible packages", required: true, options: packages.map((item) => ({ value: item.id, label: item.name[locale] })) },
  ], [isVi, locale, originalId, packages]);
  const persist = async (event: FormEvent) => { event.preventDefault(); if (!draft || !sales) return; setBusy(true); try { const next = [...sales.filter((item) => item.id !== originalId), draft].sort((a, b) => a.startsOn.localeCompare(b.startsOn)); const saved = await window.getgo.savePaymentSales(next); const canonical = saved.find((item) => item.id === draft.id) ?? draft; setSales((current) => current ? (originalId ? current.map((item) => item.id === originalId ? canonical : item) : [...current, canonical].sort((a, b) => a.startsOn.localeCompare(b.startsOn))) : current); setDraft(null); toast.show({ title: isVi ? "Đã lưu khuyến mãi" : "Sale saved", variant: "success" }); } catch (error) { toast.show({ title: isVi ? "Không thể lưu" : "Save failed", description: String(error), variant: "error" }); } finally { setBusy(false); } };
  const remove = async () => { if (!originalId || !sales) return; setBusy(true); try { await window.getgo.savePaymentSales(sales.filter((item) => item.id !== originalId)); setSales((current) => current?.filter((item) => item.id !== originalId) ?? current); setDraft(null); toast.show({ title: isVi ? "Đã xóa khuyến mãi" : "Sale deleted", variant: "success" }); } finally { setBusy(false); } };
  const columns = useMemo<ui.DataColumn<PaymentSale>[]>(() => [
    { key: "name", title: isVi ? "Sự kiện" : "Event", render: (item) => <div><strong>{item.name[locale]}</strong><span>{item.info[locale]}</span></div> },
    { key: "dates", title: isVi ? "Thời gian" : "Dates", render: (item) => <div><strong>{item.recurrence === "yearly" ? (isVi ? "Hàng năm" : "Yearly") : (isVi ? "Một lần" : "One-time")}</strong><span>{item.startsOn} – {item.endsOn}</span></div> },
    { key: "discount", title: isVi ? "Giảm" : "Discount", align: "center", width: 100, render: (item) => <ui.StatusBadge tone="success">-{item.discountPercent}%</ui.StatusBadge> },
    { key: "packages", title: isVi ? "Gói" : "Packages", render: (item) => item.packageIds.map((id) => packages.find((entry) => entry.id === id)?.name[locale] ?? id).join(", ") },
    { key: "status", title: isVi ? "Trạng thái" : "Status", align: "center", width: 110, render: (item) => <ui.StatusBadge tone={item.enabled ? "success" : "neutral"}>{item.enabled ? (isVi ? "Đang bật" : "Enabled") : (isVi ? "Đã tắt" : "Disabled")}</ui.StatusBadge> },
    { key: "actions", title: "", role: "actions", width: 56, render: (item) => <ui.TableActionButton icon={<Pencil />} aria-label={isVi ? "Sửa" : "Edit"} onClick={() => { setOriginalId(item.id); setDraft(structuredClone(item)); }} /> },
  ], [isVi, locale, packages]);
  if (sales === null) return <ui.PageLoading label={isVi ? "Đang tải trang" : "Loading page"} />;
  return <><ui.DataTable rows={sales} columns={columns} rowKey={(item) => item.id} ariaLabel={isVi ? "Khuyến mãi" : "Sales"} emptyText={isVi ? "Chưa có sự kiện khuyến mãi." : "No sale events."} />
    {draft && <ui.DialogFrame title={originalId ? (isVi ? "Sửa khuyến mãi" : "Edit sale") : (isVi ? "Tạo khuyến mãi" : "Create sale")} busy={busy} error={null} onClose={() => setDraft(null)} onSubmit={persist} onDelete={originalId ? remove : undefined} deleteConfirmText={isVi ? "Xóa sự kiện khuyến mãi này?" : "Delete this sale event?"}><ui.Form fields={fields} values={{ ...draft, nameVi: draft.name.vi, nameEn: draft.name.en, infoVi: draft.info.vi, infoEn: draft.info.en }} onChange={(name, value) => setDraft((current) => { if (!current) return current; const match = /^(name|info)(Vi|En)$/.exec(name); if (!match) return { ...current, [name]: value }; const key = match[1] as "name" | "info"; const language = match[2].toLowerCase() as "vi" | "en"; return { ...current, [key]: { ...current[key], [language]: String(value ?? "") } }; })} /></ui.DialogFrame>}
  </>;
}
