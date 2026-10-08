import type { BillingOrderEvent } from "../../shared/domain/models";

export type BillingEventDisplayStatus =
  | "success"
  | "failed"
  | "rejected"
  | "cancelled"
  | "expired"
  | "inProgress"
  | "processing"
  | "information";
export type BillingEventActor = "vietqr";

export function billingEventDisplayStatus(event: BillingOrderEvent): BillingEventDisplayStatus {
  if (event.success === false) return "failed";
  if (event.event.endsWith(".failed")) return "failed";
  if (event.event.endsWith(".rejected")) return "rejected";
  if (event.event === "checkout.cancelled") return "cancelled";
  if (event.event === "checkout.expired") return "expired";
  if (event.event.endsWith(".accepted")) return "success";
  if (event.event.endsWith(".responded") && event.success === true) return "success";
  if (event.success === true) return "success";
  if (event.event.endsWith(".requested")) return "inProgress";
  if (event.event.endsWith(".received")) return "processing";
  return "information";
}

export function showBillingEvent(event: BillingOrderEvent, environment: string): boolean {
  return environment !== "production" || !event.event.startsWith("sandbox.simulation.");
}

export function billingEventTransactionRefId(event: BillingOrderEvent): string | null {
  if (event.event !== "vietqr.qr.responded") return null;
  const response = event.detail.response;
  if (!response || typeof response !== "object" || Array.isArray(response)) return null;
  const transactionRefId = (response as Record<string, unknown>).transactionRefId;
  return typeof transactionRefId === "string" && transactionRefId.trim() ? transactionRefId.trim() : null;
}

export function billingEventActor(event: BillingOrderEvent): BillingEventActor | null {
  // The actor is the system that initiated the event, not the provider named
  // in the event key. Outbound calls are initiated by GetGo; inbound calls
  // originate from VietQR.
  if (event.direction === "inbound") return "vietqr";
  if (event.direction === "outbound") return null;

  // Older audit records may not contain direction. Keep a narrow semantic
  // fallback for events that are known to originate from VietQR.
  return [
    "vietqr.token.responded",
    "vietqr.qr.responded",
    "sandbox.simulation.responded",
    "callback.token.requested",
    "callback.transaction.received",
  ].includes(event.event)
    ? "vietqr"
    : null;
}
