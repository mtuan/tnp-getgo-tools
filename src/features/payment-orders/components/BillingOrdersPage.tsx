import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppSettings, BillingOrderDetail, BillingOrderListItem, BillingOrderQuery } from "../../../shared/domain/models";
import * as ui from "../../../shared/ui";
import { useAuth } from "../../authentication/components/AuthContext";
import en from "../../../shared/localization/en.json";
import vi from "../../../shared/localization/vi.json";
import { BillingOrderDetailPanel } from "./BillingOrderDetailPanel";

const tone = (status: string): ui.StatusBadgeTone => status === "paid" ? "success" : status === "failed" || status === "cancelled" ? "danger" : status === "pending" || status === "creating" ? "warning" : "neutral";
const formatOrderDate = (value: string | null): string => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("en", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
    .formatToParts(date)
    .reduce<Record<string, string>>((result, part) => ({ ...result, [part.type]: part.value }), {});
  return `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
};

export function BillingOrdersPage({ locale, selectedOrderId, onSelectedOrderChange }: {
  locale: AppSettings["locale"];
  selectedOrderId: string | null;
  onSelectedOrderChange(orderId: string | null): void;
}) {
  const copy = (locale === "vi" ? vi : en).billingOrders;
  const auth = useAuth();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState("");
  const [purchaseType, setPurchaseType] = useState("");
  const [items, setItems] = useState<BillingOrderListItem[] | null>(null);
  const [page, setPage] = useState(1);
  const [pageCursors, setPageCursors] = useState<Array<string | null>>([null]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [detail, setDetail] = useState<BillingOrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(selectedOrderId);

  useEffect(() => { const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300); return () => window.clearTimeout(timer); }, [search]);
  useEffect(() => { setActiveOrderId(selectedOrderId); }, [selectedOrderId]);
  const query = useMemo<BillingOrderQuery>(() => ({ search: debouncedSearch || undefined, status: status as BillingOrderQuery["status"] || undefined,
    purchaseType: purchaseType as BillingOrderQuery["purchaseType"] || undefined, limit: 25 }), [debouncedSearch, purchaseType, status]);
  const loadPage = useCallback((targetPage: number, cursor: string | null) => auth.requireAuth(async () => {
    setLoading(true); setListError(null);
    try {
      const result = await window.getgo.listBillingOrders({ ...query, cursor: cursor ?? undefined });
      setItems(result.items); setNextCursor(result.nextCursor); setPage(targetPage);
      setPageCursors((current) => { const next = current.slice(0, targetPage); next[targetPage - 1] = cursor; if (result.nextCursor) next[targetPage] = result.nextCursor; return next; });
    } catch (cause) { setListError(cause instanceof Error ? cause.message : String(cause)); setItems([]); }
    finally { setLoading(false); }
  }), [auth, query]);
  useEffect(() => { setPageCursors([null]); void loadPage(1, null); }, [loadPage]);
  useEffect(() => {
    if (!activeOrderId) { setDetail(null); setDetailError(null); return; }
    auth.requireAuth(async () => {
      setDetailLoading(true); setDetailError(null);
      try { setDetail(await window.getgo.loadBillingOrderDetail(activeOrderId)); }
      catch (cause) { setDetail(null); setDetailError(cause instanceof Error ? cause.message : String(cause)); }
      finally { setDetailLoading(false); }
    });
  }, [activeOrderId, auth]);
  const selectOrder = (orderId: string | null) => {
    setActiveOrderId(orderId);
    onSelectedOrderChange(orderId);
  };

  const columns = useMemo<ui.DataColumn<BillingOrderListItem>[]>(() => [
    { key: "order", title: copy.order, width: 130, render: (item) => <div className="billing-order-list-primary"><strong>{item.id}</strong><ui.StatusBadge tone={tone(item.status)}>{item.status}</ui.StatusBadge></div> },
    { key: "product", title: copy.product, width: 150, render: (item) => <div><strong>{item.productName || item.productId || "—"}</strong><small>{item.purchaseType === "topic" ? copy.topic : copy.subscription}</small></div> },
    { key: "amount", title: copy.amount, width: 95, align: "right", render: (item) => `${item.amount.toLocaleString(locale === "vi" ? "vi-VN" : "en-US")} ${item.currency}` },
    { key: "updated", title: copy.date, width: 145, render: (item) => formatOrderDate(item.updatedAt) },
  ], [copy, locale]);
  const filters = <div className="billing-orders-toolbar">
    <ui.SearchField value={search} placeholder={copy.searchPlaceholder} ariaLabel={copy.searchLabel} clearLabel={copy.clearSearch} onValueChange={setSearch} />
    <ui.Select value={status} ariaLabel={copy.allStatuses} options={[{ value: "", label: copy.allStatuses }, ...["creating", "pending", "paid", "failed", "cancelled", "expired", "needs-review"].map((value) => ({ value, label: value }))]} onValueChange={setStatus} />
    <ui.Select value={purchaseType} ariaLabel={copy.allPurchaseTypes} options={[{ value: "", label: copy.allPurchaseTypes }, { value: "subscription", label: copy.subscription }, { value: "topic", label: copy.topic }]} onValueChange={setPurchaseType} />
    <ui.Button variant="icon" icon={<RefreshCw />} aria-label={copy.refresh} title={copy.refresh} loading={loading} onClick={() => void loadPage(page, pageCursors[page - 1] ?? null)} />
  </div>;

  return <div className="billing-orders-page">
    <section className="billing-orders-controls" aria-label={copy.title}>
      <div className="billing-orders-intro"><div><h2>{copy.title}</h2><p>{copy.description}</p></div><ui.StatusBadge tone="info">{copy.readOnly}</ui.StatusBadge></div>
      {filters}
      {listError && <ui.ErrorFrame message={listError} onDismiss={() => setListError(null)} />}
    </section>
    <div className={`billing-orders-content ${activeOrderId ? "has-selection" : ""}`}>
      <section className="billing-orders-list" aria-label={copy.title}>
        {items === null ? <ui.PageLoading label={copy.loading} /> : <ui.DataTable rows={items} columns={columns} rowKey={(item) => item.id} ariaLabel={copy.title} emptyText={copy.empty} selectedRowKey={activeOrderId ?? undefined} onRowClick={(item) => selectOrder(item.id)} footer={<ui.Pagination locale={locale} page={page} hasNextPage={Boolean(nextCursor)} disabled={loading} onPageChange={(nextPage) => void loadPage(nextPage, pageCursors[nextPage - 1] ?? null)} />} />}
      </section>
      {activeOrderId && <BillingOrderDetailPanel locale={locale} detail={detail} loading={detailLoading} error={detailError} onBack={() => selectOrder(null)} />}
    </div>
  </div>;
}
