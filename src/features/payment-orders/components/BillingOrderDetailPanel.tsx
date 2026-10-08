import { ArrowLeft, AlertTriangle, Check, CheckCircle2, Clock3, PanelRightClose, X, XCircle } from "lucide-react";
import type { AppSettings, BillingOrderDetail, BillingOrderEvent, BillingOrderWarningCode } from "../../../shared/domain/models";
import * as ui from "../../../shared/ui";
import en from "../../../shared/localization/en.json";
import vi from "../../../shared/localization/vi.json";
import { billingEventActor, billingEventDisplayStatus, billingEventTransactionRefId, showBillingEvent, type BillingEventDisplayStatus } from "../billing-event-presentation";

type Copy = typeof en.billingOrders;

const statusTone = (status: string): ui.StatusBadgeTone => status === "paid" || status === "active" ? "success"
  : status === "failed" || status === "cancelled" ? "danger" : status === "pending" || status === "creating" || status === "needs-review" ? "warning" : "neutral";
const eventSummary = (event: BillingOrderEvent, copy: Copy): string => {
  const parts = [event.direction, event.endpoint, event.httpStatus ? `HTTP ${event.httpStatus}` : "", event.durationMs != null ? `${event.durationMs} ms` : ""].filter(Boolean);
  if (parts.length) return parts.join(" · ");
  const keys = Object.keys(event.detail);
  return keys.length ? keys.slice(0, 4).join(", ") : copy.notAvailable;
};
const eventStatusTone = (status: BillingEventDisplayStatus): ui.StatusBadgeTone => status === "success" ? "success"
  : status === "failed" || status === "rejected" ? "danger" : status === "expired" ? "warning" : status === "inProgress" || status === "processing" ? "info" : "neutral";
const formatDate = (value: string | null, locale: AppSettings["locale"], fallback: string): string => value
  ? new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", { dateStyle: "medium", timeStyle: "medium" }).format(new Date(value)) : fallback;
const formatEventDate = (value: string | null, fallback: string): string => {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  const pad = (part: number, length = 2) => String(part).padStart(length, "0");
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
};
const display = (value: string | null | undefined, fallback: string): string => value || fallback;

function DetailGrid({ children }: { children: React.ReactNode }) {
  return <dl className="billing-order-detail-grid">{children}</dl>;
}
function DetailItem({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return <div><dt>{label}</dt><dd className={mono ? "billing-order-mono" : undefined}>{value}</dd></div>;
}

export function BillingOrderDetailPanel({ locale, detail, loading, error, onBack }: {
  locale: AppSettings["locale"];
  detail: BillingOrderDetail | null;
  loading: boolean;
  error: string | null;
  onBack(): void;
}) {
  const copy = (locale === "vi" ? vi : en).billingOrders;
  const warningText: Record<BillingOrderWarningCode, string> = {
    "missing-transaction": copy.warningMessages.missingTransaction,
    "status-mismatch": copy.warningMessages.statusMismatch,
    "missing-user": copy.warningMessages.missingUser,
    "missing-product": copy.warningMessages.missingProduct,
    "missing-access": copy.warningMessages.missingAccess,
    "missing-pending": copy.warningMessages.missingPending,
    "stale-pending": copy.warningMessages.stalePending,
    "duplicate-count-mismatch": copy.warningMessages.duplicateCountMismatch,
  };
  if (loading) return <div className="billing-order-detail"><ui.PageLoading label={copy.loadingDetail} /></div>;
  if (error) return <div className="billing-order-detail"><ui.Button className="billing-order-mobile-back" variant="text" icon={<ArrowLeft />} onClick={onBack}>{copy.backToOrders}</ui.Button><ui.Button className="billing-order-desktop-collapse" variant="icon" icon={<PanelRightClose />} aria-label={copy.closeDetail} title={copy.closeDetail} onClick={onBack} /><ui.ErrorFrame message={error} /></div>;
  if (!detail) return null;
  const { order, transaction, user, product, access } = detail;
  const visibleEvents = detail.events.filter((event) => showBillingEvent(event, order.environment));
  const eventPresentations = copy.eventPresentations as Record<string, { label: string; description: string }>;
  return <article className="billing-order-detail" aria-label={`${copy.order} ${order.id}`}>
    <ui.Button className="billing-order-mobile-back" variant="text" icon={<ArrowLeft />} onClick={onBack}>{copy.backToOrders}</ui.Button>
    <header className="billing-order-detail-header">
      <div><span className="billing-order-eyebrow">{copy.order}</span><div className="billing-order-title-line"><h2>{order.id}</h2><ui.StatusBadge tone={statusTone(order.status)}>{order.status}</ui.StatusBadge></div><p>{copy.created}: {formatDate(order.createdAt, locale, copy.notAvailable)}</p></div>
      <ui.Button className="billing-order-desktop-collapse" variant="icon" icon={<PanelRightClose />} aria-label={copy.closeDetail} title={copy.closeDetail} onClick={onBack} />
    </header>
    {detail.warnings.length > 0 && <section className="billing-order-warning-card"><h3><AlertTriangle aria-hidden="true" />{copy.warnings}</h3><ul>{detail.warnings.map((warning) => <li key={warning}>{warningText[warning]}</li>)}</ul></section>}
    <div className="billing-order-card-grid">
      <section className="billing-order-card"><h3>{copy.user}</h3><DetailGrid>
        <DetailItem label={copy.customer} value={display(user?.name, copy.notAvailable)} />
        <DetailItem label={copy.userId} value={display(user?.id, copy.notAvailable)} mono />
        <DetailItem label={copy.email} value={display(user?.email, copy.notAvailable)} />
        <DetailItem label={copy.membership} value={display(user?.packageId, copy.notAvailable)} />
        <DetailItem label={copy.expires} value={formatDate(user?.subscriptionExpiresAt ?? null, locale, copy.notAvailable)} />
      </DetailGrid></section>
      <section className="billing-order-card"><h3>{copy.purchase}</h3><DetailGrid>
        <DetailItem label={copy.purchaseType} value={order.purchaseType === "topic" ? copy.topic : copy.subscription} />
        <DetailItem label={copy.productId} value={order.productId} mono />
        {order.topicId && <DetailItem label={copy.topicId} value={order.topicId} mono />}
        <DetailItem label={copy.product} value={display(product?.name || order.productName, copy.notAvailable)} />
        <DetailItem label={copy.amount} value={`${order.amount.toLocaleString(locale === "vi" ? "vi-VN" : "en-US")} ${order.currency}`} />
        <DetailItem label={copy.provider} value={display(order.provider, copy.notAvailable)} />
      </DetailGrid></section>
      <section className="billing-order-card"><h3>{copy.transaction}</h3><DetailGrid>
        <DetailItem label={copy.transactionId} value={display(transaction?.id || order.transactionId, copy.notAvailable)} mono />
        <DetailItem label={copy.latestStatus} value={<ui.StatusBadge tone={statusTone(transaction?.status ?? "unknown")}>{transaction?.status ?? copy.unknown}</ui.StatusBadge>} />
        <DetailItem label={copy.providerTransactionId} value={display(transaction?.providerTransactionId, copy.notAvailable)} mono />
        <DetailItem label={copy.referenceNumber} value={display(transaction?.referenceNumber, copy.notAvailable)} mono />
        <DetailItem label={copy.updated} value={formatDate(transaction?.updatedAt ?? null, locale, copy.notAvailable)} />
      </DetailGrid></section>
      <section className="billing-order-card"><h3>{copy.access}</h3>{access ? <DetailGrid>
        <DetailItem label={copy.purchaseType} value={access.kind === "topic" ? copy.topic : copy.subscription} />
        <DetailItem label="ID" value={access.id} mono />
        <DetailItem label={copy.latestStatus} value={<ui.StatusBadge tone={statusTone(access.status)}>{access.status || copy.unknown}</ui.StatusBadge>} />
        <DetailItem label={copy.created} value={formatDate(access.grantedAt, locale, copy.notAvailable)} />
        <DetailItem label={copy.expires} value={formatDate(access.expiresAt, locale, copy.notAvailable)} />
      </DetailGrid> : <p className="billing-order-muted">{copy.accessMissing}</p>}
        {(order.status === "creating" || order.status === "pending") && <p className="billing-order-pending-line">{detail.pending ? <CheckCircle2 aria-hidden="true" /> : <XCircle aria-hidden="true" />} {copy.pendingMarker}: {detail.pending ? copy.present : copy.absent}</p>}
      </section>
    </div>
    <section className="billing-order-card billing-order-wide-card"><h3>{copy.duplicates}</h3>
      {detail.duplicatePayments.length === 0 ? <p className="billing-order-muted">{copy.noDuplicates}</p> : <ui.DataTable rows={detail.duplicatePayments} rowKey={(item) => item.id} ariaLabel={copy.duplicates} columns={[
        { key: "id", title: "ID", render: (item) => <span className="billing-order-mono">{item.id}</span> },
        { key: "provider", title: copy.providerTransactionId, render: (item) => <span className="billing-order-mono">{item.providerTransactionId}</span> },
        { key: "amount", title: copy.amount, render: (item) => item.amount.toLocaleString(locale === "vi" ? "vi-VN" : "en-US") },
        { key: "status", title: copy.latestStatus, render: (item) => <ui.StatusBadge tone={statusTone(item.status)}>{item.status}</ui.StatusBadge> },
      ]} />}
    </section>
    <section className="billing-order-card billing-order-wide-card billing-event-flow-card">
      <div className="billing-event-flow-heading"><h3>{copy.eventFlow}</h3></div>
      {visibleEvents.length === 0 ? <p className="billing-order-muted">{copy.noEvents}</p> : <ol className="billing-event-timeline">
        {visibleEvents.map((event) => {
          const status = billingEventDisplayStatus(event);
          const presentation = eventPresentations[event.event] ?? eventPresentations.fallback;
          const transactionRefId = billingEventTransactionRefId(event);
          const actor = billingEventActor(event);
          const failed = status === "failed" || status === "rejected";
          return <li key={event.id} className={`billing-event-timeline-item is-${status}`}>
            <div className="billing-event-timeline-marker" aria-hidden="true">{status === "success" ? <Check /> : failed ? <X /> : <Clock3 />}</div>
            <div className="billing-event-timeline-content">
              <div className="billing-event-timeline-title"><strong>{presentation.label}</strong>{actor === "vietqr" && <img className="billing-event-actor-logo" src="./icons/vietqr.png" alt="VietQR" />}<ui.StatusBadge tone={eventStatusTone(status)}>{copy.eventStatuses[status]}</ui.StatusBadge></div>
              <p className="billing-event-friendly-description">{presentation.description}</p>
              {transactionRefId && <p className="billing-event-reference"><span>{copy.vietQrTransactionRefId}</span><code>{transactionRefId}</code></p>}
              <p className="billing-event-technical-detail"><code>{event.event}</code><span>{eventSummary(event, copy)}</span></p>
              <time dateTime={event.createdAt ?? undefined}>{formatEventDate(event.createdAt, copy.notAvailable)}</time>
            </div>
          </li>;
        })}
      </ol>}
    </section>
  </article>;
}
