import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Pencil } from "lucide-react";
import type { AppSettings, PaymentEvent, PaymentPackage } from "../../../shared/domain/models";
import * as ui from "../../../shared/ui";
import { suggestPaymentEventId } from "../domain/payment-event";

const today = () => new Date().toISOString().slice(0, 10);
const emptyEvent = (): PaymentEvent => ({
  id: "", type: "sale", name: { en: "", vi: "" }, info: { en: "", vi: "" },
  recurrence: "one-time", startsOn: today(), endsOn: today(), enabled: true,
  discountPercent: 10, targets: { packageIds: [] },
});

const eventFormValues = (event: PaymentEvent): ui.FormValues => ({
  ...event, nameVi: event.name.vi, nameEn: event.name.en, infoVi: event.info.vi, infoEn: event.info.en,
  ...(event.type === "sale" ? { packageIds: event.targets.packageIds } : { userTypes: event.targets.userTypes }),
});

function validateEvent(event: PaymentEvent, isVi: boolean): ui.FormErrors {
  const required = isVi ? "Trường này là bắt buộc." : "This field is required.";
  const errors: ui.FormErrors = {};
  if (!event.name.vi.trim()) errors.nameVi = required;
  if (!event.startsOn) errors.startsOn = required;
  if (!event.endsOn) errors.endsOn = required;
  else if (event.startsOn && event.endsOn < event.startsOn) errors.endsOn = isVi ? "Ngày kết thúc phải từ ngày bắt đầu trở đi." : "End date must be on or after the start date.";
  if (event.type === "sale") {
    if (!event.targets.packageIds.length) errors.packageIds = required;
    if (event.discountPercent < 1 || event.discountPercent > 100) errors.discountPercent = isVi ? "Nhập giá trị từ 1 đến 100." : "Enter a value from 1 to 100.";
  } else {
    if (!event.targets.userTypes.length) errors.userTypes = required;
    if (event.premiumDays < 1 || event.premiumDays > 365) errors.premiumDays = isVi ? "Nhập giá trị từ 1 đến 365." : "Enter a value from 1 to 365.";
  }
  return errors;
}

export function PaymentEventsManager({ locale, packages, createRequest, onCreateRequestHandled }: {
  locale: AppSettings["locale"]; packages: PaymentPackage[]; createRequest: number; onCreateRequestHandled(): void;
}) {
  const isVi = locale === "vi";
  const toast = ui.useToast();
  const [events, setEvents] = useState<PaymentEvent[] | null>(null);
  const [draft, setDraft] = useState<PaymentEvent | null>(null);
  const [originalId, setOriginalId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<ui.FormErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  useEffect(() => { void window.getgo.listPaymentEvents().then(setEvents).catch((error) => toast.show({ title: isVi ? "Không thể tải sự kiện" : "Could not load events", description: String(error), variant: "error" })); }, []);
  useEffect(() => { if (!createRequest) return; setOriginalId(null); setFieldErrors({}); setSaveError(null); setDraft(emptyEvent()); onCreateRequestHandled(); }, [createRequest, onCreateRequestHandled]);

  const fields = useMemo<ui.FormSchema[]>(() => {
    const requiredMessage = isVi ? "Trường này là bắt buộc." : "This field is required.";
    const common: ui.FormSchema[] = [
      [{ type: "select", name: "type", label: isVi ? "Loại sự kiện" : "Event type", options: [{ value: "sale", label: isVi ? "Khuyến mãi" : "Sale" }, { value: "premium-preview", label: isVi ? "Dùng thử Premium" : "Premium preview" }] }, { type: "toggle", name: "enabled", label: isVi ? "Đang bật" : "Enabled" }],
      [{ type: "text", name: "nameVi", label: "Tên (VI)", required: true, requiredMessage }, { type: "text", name: "nameEn", label: "Name (EN)" }],
      [{ type: "textarea", name: "infoVi", label: "Thông tin (VI)" }, { type: "textarea", name: "infoEn", label: "Information (EN)" }],
      [{ type: "select", name: "recurrence", label: isVi ? "Lặp lại" : "Recurrence", options: [{ value: "one-time", label: isVi ? "Một lần" : "One-time" }, { value: "yearly", label: isVi ? "Hàng năm" : "Yearly" }] }, { type: "date", name: "startsOn", label: isVi ? "Bắt đầu" : "Starts on", required: true, requiredMessage }, { type: "date", name: "endsOn", label: isVi ? "Kết thúc" : "Ends on", required: true, requiredMessage }],
    ];
    const specific: ui.FormSchema[] = draft?.type === "sale" ? [
      [{ type: "number", name: "discountPercent", label: isVi ? "Giảm giá (%)" : "Discount (%)", required: true, requiredMessage, min: 1, max: 100 }],
      { type: "multi-select", name: "packageIds", label: isVi ? "Gói áp dụng" : "Target packages", required: true, requiredMessage, options: packages.map((item) => ({ value: item.id, label: item.name[locale] })) },
    ] : [
      [{ type: "number", name: "premiumDays", label: isVi ? "Số ngày Premium" : "Premium days", required: true, requiredMessage, min: 1, max: 365 }],
      { type: "multi-select", name: "userTypes", label: isVi ? "Người dùng áp dụng" : "Target users", required: true, requiredMessage, options: [{ value: "new-registration", label: isVi ? "Đăng ký mới" : "New registrations" }, { value: "legacy-migration", label: isVi ? "Di chuyển lần đầu" : "First legacy migration" }] },
    ];
    return [...common, ...specific];
  }, [draft?.type, isVi, locale, originalId, packages]);

  const persist = async (event: FormEvent) => {
    event.preventDefault(); if (!draft || !events) return;
    setSaveError(null);
    const errors = validateEvent(draft, isVi);
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    const reservedIds = events.filter((item) => item.id !== originalId).map((item) => item.id);
    const englishName = draft.name.en.trim() || draft.name.vi.trim();
    const canonical = { ...draft, id: originalId ?? suggestPaymentEventId(englishName, reservedIds), name: { ...draft.name, en: englishName } };
    setBusy(true);
    try {
      if (events.some((item) => item.id === canonical.id && item.id !== originalId)) {
        toast.show({ title: isVi ? "ID sự kiện đã tồn tại" : "Event ID already exists", description: isVi ? "Hãy dùng một ID duy nhất." : "Choose a unique event ID.", variant: "error" });
        return;
      }
      const next = [...events.filter((item) => item.id !== originalId), canonical].sort((a, b) => a.startsOn.localeCompare(b.startsOn));
      const saved = await window.getgo.savePaymentEvents(next);
      setEvents(saved); setDraft(null);
      toast.show({ title: isVi ? "Đã lưu sự kiện" : "Event saved", variant: "success" });
    } catch { setSaveError(isVi ? "Không thể lưu sự kiện. Vui lòng kiểm tra các trường và thử lại." : "The event could not be saved. Check the fields and try again."); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!originalId || !events) return; setBusy(true);
    try { const saved = await window.getgo.savePaymentEvents(events.filter((item) => item.id !== originalId)); setEvents(saved); setDraft(null); toast.show({ title: isVi ? "Đã xóa sự kiện" : "Event deleted", variant: "success" }); }
    finally { setBusy(false); }
  };
  const columns = useMemo<ui.DataColumn<PaymentEvent>[]>(() => [
    { key: "name", title: isVi ? "Sự kiện" : "Event", render: (item) => <div><strong>{item.name[locale]}</strong><span className="ui-table-secondary">{item.info[locale] || "—"}</span></div> },
    { key: "type", title: isVi ? "Loại" : "Type", render: (item) => item.type === "sale" ? (isVi ? "Khuyến mãi" : "Sale") : (isVi ? "Dùng thử Premium" : "Premium preview") },
    { key: "dates", title: isVi ? "Thời gian" : "Dates", render: (item) => <div><strong>{item.recurrence === "yearly" ? (isVi ? "Hàng năm" : "Yearly") : (isVi ? "Một lần" : "One-time")}</strong><span className="ui-table-secondary">{item.startsOn} – {item.endsOn}</span></div> },
    { key: "target", title: isVi ? "Đối tượng" : "Target", render: (item) => item.type === "sale" ? item.targets.packageIds.map((id) => packages.find((entry) => entry.id === id)?.name[locale] ?? id).join(", ") : item.targets.userTypes.map((type) => type === "new-registration" ? (isVi ? "Đăng ký mới" : "New registrations") : (isVi ? "Di chuyển lần đầu" : "First migration")).join(", ") },
    { key: "value", title: isVi ? "Quyền lợi" : "Benefit", align: "center", render: (item) => <ui.StatusBadge tone="success">{item.type === "sale" ? `-${item.discountPercent}%` : `${item.premiumDays} ${isVi ? "ngày" : "days"}`}</ui.StatusBadge> },
    { key: "status", title: isVi ? "Trạng thái" : "Status", align: "center", render: (item) => <ui.StatusBadge tone={item.enabled ? "success" : "neutral"}>{item.enabled ? (isVi ? "Đang bật" : "Enabled") : (isVi ? "Đã tắt" : "Disabled")}</ui.StatusBadge> },
    { key: "actions", title: "", role: "actions", width: 56, render: (item) => <ui.TableActionButton icon={<Pencil />} aria-label={isVi ? "Sửa" : "Edit"} onClick={() => { setOriginalId(item.id); setFieldErrors({}); setSaveError(null); setDraft(structuredClone(item)); }} /> },
  ], [isVi, locale, packages]);
  if (events === null) return <ui.PageLoading label={isVi ? "Đang tải trang" : "Loading page"} />;
  return <>
    <ui.DataTable rows={events} columns={columns} rowKey={(item) => item.id} ariaLabel={isVi ? "Sự kiện" : "Events"} emptyText={isVi ? "Chưa có sự kiện." : "No events."} />
    {draft && <ui.DialogFrame title={originalId ? (isVi ? "Sửa sự kiện" : "Edit event") : (isVi ? "Tạo sự kiện" : "Create event")} busy={busy} error={saveError} onClose={() => setDraft(null)} onSubmit={persist} onDelete={originalId ? remove : undefined} deleteConfirmText={isVi ? "Xóa sự kiện này?" : "Delete this event?"}><ui.Form fields={fields} values={eventFormValues(draft)} errors={fieldErrors} onChange={(name, value) => { setFieldErrors((current) => { const next = { ...current }; delete next[name]; return next; }); setSaveError(null); setDraft((current) => {
      if (!current) return current;
      if (name === "type") return value === "premium-preview" ? { ...emptyEvent(), ...current, type: "premium-preview", premiumDays: 14, targets: { userTypes: ["new-registration"] } } : { ...emptyEvent(), ...current, type: "sale", discountPercent: 10, targets: { packageIds: [] } };
      if (name === "packageIds" && current.type === "sale") return { ...current, targets: { packageIds: value as string[] } };
      if (name === "userTypes" && current.type === "premium-preview") return { ...current, targets: { userTypes: value as Array<"new-registration" | "legacy-migration"> } };
      const match = /^(name|info)(Vi|En)$/.exec(name);
      if (!match) return { ...current, [name]: value } as PaymentEvent;
      const key = match[1] as "name" | "info"; const language = match[2].toLowerCase() as "vi" | "en";
      const text = String(value ?? "");
      if (key === "name" && language === "en" && originalId === null) {
        const reservedIds = events?.map((item) => item.id) ?? [];
        const previousSuggestion = suggestPaymentEventId(current.name.en, reservedIds);
        const id = !current.id || current.id === previousSuggestion ? suggestPaymentEventId(text, reservedIds) : current.id;
        return { ...current, id, name: { ...current.name, en: text } };
      }
      return { ...current, [key]: { ...current[key], [language]: text } };
    }); }} /></ui.DialogFrame>}
  </>;
}
