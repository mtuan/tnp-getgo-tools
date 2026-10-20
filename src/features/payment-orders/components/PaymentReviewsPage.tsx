import { CheckCircle2, Eye, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { AppSettings, PaymentReviewItem } from "../../../shared/domain/models";
import * as ui from "../../../shared/ui";
import { useAuth } from "../../authentication/components/AuthContext";
import en from "../../../shared/localization/en.json";
import vi from "../../../shared/localization/vi.json";

const reviewTone = (status: PaymentReviewItem["status"]): ui.StatusBadgeTone => status === "resolved" ? "success" : "warning";

export function PaymentReviewsPage({ locale }: { locale: AppSettings["locale"] }) {
  const copy = (locale === "vi" ? vi : en).paymentReviews;
  const auth = useAuth(); const toast = ui.useToast();
  const [items, setItems] = useState<PaymentReviewItem[] | null>(null);
  const [status, setStatus] = useState<"all" | PaymentReviewItem["status"]>("pending");
  const [search, setSearch] = useState(""); const [selected, setSelected] = useState<PaymentReviewItem | null>(null);
  const [values, setValues] = useState<ui.FormValues>({ feedback: "" }); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const fields = useMemo<ui.FormSchema[]>(() => [{ name: "feedback", type: "textarea", label: copy.feedback, helper: copy.feedbackHelper, rows: 5, required: true, rules: { maxLength: { value: 2000, message: copy.feedbackTooLong } } }], [copy]);
  const load = useCallback(() => auth.requireAuth(async () => { setBusy(true); setError(null); try { const all: PaymentReviewItem[] = []; let cursor: string | undefined; do { const page = await window.getgo.listPaymentReviews(cursor, 100); all.push(...page.items); cursor = page.nextCursor ?? undefined; } while (cursor); setItems(all); } catch (cause) { setItems([]); setError(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(false); } }), [auth]);
  useEffect(() => { void load(); }, [load]);
  const filtered = useMemo(() => { const term = search.trim().toLocaleLowerCase(); return (items ?? []).filter(item => (status === "all" || item.status === status) && (!term || [item.parentName, item.parentEmail, item.orderId, item.providerTransactionId, item.productId].some(value => value.toLocaleLowerCase().includes(term)))); }, [items, search, status]);
  const open = (item: PaymentReviewItem) => { setSelected(item); setValues({ feedback: item.feedback }); setError(null); };
  const resolve = async (event: FormEvent) => { event.preventDefault(); if (!selected || selected.status === "resolved") return; const feedback = String(values.feedback ?? "").trim(); if (!feedback) { setError(copy.feedbackRequired); return; } setBusy(true); setError(null); try { const updated = await window.getgo.resolvePaymentReview(selected.id, feedback); setItems(current => current?.map(item => item.id === updated.id ? updated : item) ?? [updated]); setSelected(null); toast.show({ title: copy.resolvedSuccess, variant: "success" }); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(false); } };
  const columns = useMemo<ui.DataColumn<PaymentReviewItem>[]>(() => [
    { key: "customer", title: copy.customer, render: item => <div><strong>{item.parentName || copy.unknownCustomer}</strong><small>{item.parentEmail || item.parentUid}</small></div> },
    { key: "payment", title: copy.payment, render: item => <div><strong>{item.productName?.[locale] || item.productName?.en || item.productId}</strong><small>{item.orderId} · {item.providerTransactionId}</small></div> },
    { key: "amount", title: copy.amount, width: 110, align: "right", render: item => `${item.amount.toLocaleString(locale === "vi" ? "vi-VN" : "en-US")} ${item.currency}` },
    { key: "status", title: copy.status, width: 110, render: item => <ui.StatusBadge tone={reviewTone(item.status)}>{copy[item.status]}</ui.StatusBadge> },
    { key: "updated", title: copy.updated, width: 150, render: item => item.updatedAt ? new Date(item.updatedAt).toLocaleString(locale === "vi" ? "vi-VN" : "en-US") : "—" },
    { key: "actions", title: copy.actions, width: 72, align: "right", render: item => <ui.Button variant="icon" icon={item.status === "pending" ? <CheckCircle2 /> : <Eye />} aria-label={item.status === "pending" ? copy.resolve : copy.view} title={item.status === "pending" ? copy.resolve : copy.view} onClick={() => open(item)} /> },
  ], [copy, locale]);
  return <div className="billing-orders-page"><section className="billing-orders-controls" aria-label={copy.title}><div className="billing-orders-intro"><div><h2>{copy.title}</h2><p>{copy.description}</p></div></div><div className="billing-orders-toolbar"><ui.SearchField value={search} placeholder={copy.searchPlaceholder} ariaLabel={copy.searchLabel} clearLabel={copy.clearSearch} onValueChange={setSearch} /><ui.Select value={status} ariaLabel={copy.status} options={[{ value: "all", label: copy.all }, { value: "pending", label: copy.pending }, { value: "resolved", label: copy.resolved }]} onValueChange={value => setStatus(value as typeof status)} /><ui.Button variant="icon" icon={<RefreshCw />} aria-label={copy.refresh} title={copy.refresh} loading={busy} onClick={() => void load()} /></div>{error && !selected && <ui.ErrorFrame message={error} onDismiss={() => setError(null)} />}</section>
    {items === null ? <ui.PageLoading label={copy.loading} /> : <ui.DataTable rows={filtered} columns={columns} rowKey={item => item.id} ariaLabel={copy.title} emptyText={copy.empty} onRowClick={open} />}
    {selected && <ui.DialogFrame presentation="drawer" title={selected.status === "pending" ? copy.resolveTitle : copy.viewTitle} busy={busy} error={error} hideFooter={selected.status === "resolved"} submitLabel={copy.resolve} submitColor="success" submitDisabled={!String(values.feedback ?? "").trim()} saveShortcut={selected.status === "pending"} onClose={() => !busy && setSelected(null)} onSubmit={resolve}><dl className="billing-order-detail-grid"><div><dt>{copy.customer}</dt><dd>{selected.parentName || copy.unknownCustomer}<small>{selected.parentEmail || selected.parentUid}</small></dd></div><div><dt>{copy.payment}</dt><dd>{selected.orderId}<small>{selected.providerTransactionId}</small></dd></div><div><dt>{copy.userNote}</dt><dd>{selected.note}</dd></div></dl>{selected.status === "pending" ? <ui.Form fields={fields} values={values} onChange={(name, value) => { setValues(current => ({ ...current, [name]: value })); setError(null); }} /> : <dl className="billing-order-detail-grid"><div><dt>{copy.feedback}</dt><dd>{selected.feedback}</dd></div></dl>}</ui.DialogFrame>}
  </div>;
}
