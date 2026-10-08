import type { FirebaseAuthService } from "../../authentication/main/firebase-auth.js";
import type {
  BillingDuplicatePayment,
  BillingOrderAccess,
  BillingOrderDetail,
  BillingOrderEvent,
  BillingOrderListItem,
  BillingOrderPage,
  BillingOrderProduct,
  BillingOrderQuery,
  BillingOrderStatus,
  BillingOrderTransaction,
  BillingOrderUser,
  BillingOrderWarningCode,
} from "../../../shared/domain/models.js";

type FirestoreValue = {
  nullValue?: null; booleanValue?: boolean; integerValue?: string; doubleValue?: number;
  timestampValue?: string; stringValue?: string; referenceValue?: string;
  arrayValue?: { values?: FirestoreValue[] }; mapValue?: { fields?: Record<string, FirestoreValue> };
};
type FirestoreDocument = { name: string; fields?: Record<string, FirestoreValue> };
type OrderCursor = { documentName: string; createdAt: string };
type JsonRecord = Record<string, unknown>;

const statuses = new Set<BillingOrderStatus>(["creating", "pending", "paid", "failed", "cancelled", "expired", "needs-review", "unknown"]);
const sensitiveKeys = new Set(["access_token", "authorization", "password", "callbacksigningkey", "qrcode"]);
const documentId = (name: string): string => decodeURIComponent(name.split("/").at(-1) ?? "");
const field = {
  string: (value: string): FirestoreValue => ({ stringValue: value }),
  reference: (value: string): FirestoreValue => ({ referenceValue: value }),
  timestamp: (value: string): FirestoreValue => ({ timestampValue: value }),
};

export function decodeFirestoreValue(value?: FirestoreValue): unknown {
  if (!value || value.nullValue === null) return null;
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.timestampValue !== undefined) return value.timestampValue;
  if (value.referenceValue !== undefined) return value.referenceValue;
  if (value.booleanValue !== undefined) return value.booleanValue;
  if (value.integerValue !== undefined) return Number(value.integerValue);
  if (value.doubleValue !== undefined) return value.doubleValue;
  if (value.arrayValue) return (value.arrayValue.values ?? []).map(decodeFirestoreValue);
  if (value.mapValue) return decodeFields(value.mapValue.fields);
  return null;
}

function decodeFields(fields?: Record<string, FirestoreValue>): JsonRecord {
  return Object.fromEntries(Object.entries(fields ?? {}).map(([key, value]) => [key, decodeFirestoreValue(value)]));
}

export function sanitizeBillingRecord(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeBillingRecord);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as JsonRecord)
    .filter(([key]) => !sensitiveKeys.has(key.toLocaleLowerCase()))
    .map(([key, item]) => [key, key.toLocaleLowerCase() === "bankaccount" ? maskAccount(item) : sanitizeBillingRecord(item)]));
}

const maskAccount = (value: unknown): unknown => typeof value === "string" && value.length > 4
  ? `${"*".repeat(Math.min(8, value.length - 4))}${value.slice(-4)}` : value;
const string = (record: JsonRecord, key: string): string => typeof record[key] === "string" ? record[key] : "";
const number = (record: JsonRecord, key: string): number => typeof record[key] === "number" && Number.isFinite(record[key]) ? record[key] : 0;
const timestamp = (record: JsonRecord, key: string): string | null => string(record, key) || null;
const status = (value: unknown): BillingOrderStatus => typeof value === "string" && statuses.has(value as BillingOrderStatus) ? value as BillingOrderStatus : "unknown";
const localizedName = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const name = value as JsonRecord;
  return string(name, "en") || string(name, "vi");
};

function recordFromDocument(document: FirestoreDocument): JsonRecord {
  return sanitizeBillingRecord(decodeFields(document.fields)) as JsonRecord;
}

function orderFromDocument(document: FirestoreDocument, defaultEnvironment = ""): BillingOrderListItem {
  const value = recordFromDocument(document);
  const purchaseType = value.purchaseType === "subscription" || value.purchaseType === "topic" ? value.purchaseType : "unknown";
  return {
    id: documentId(document.name), transactionId: string(value, "transactionId"), parentUid: string(value, "parentUid"),
    purchaseType, productId: string(value, "productId"), productName: localizedName(value.productName),
    topicId: string(value, "topicId") || null, provider: string(value, "provider"), amount: number(value, "amount"),
    currency: string(value, "currency"), status: status(value.status), environment: string(value, "environment") || defaultEnvironment,
    createdAt: timestamp(value, "createdAt"), updatedAt: timestamp(value, "updatedAt"), checkoutExpiresAt: timestamp(value, "checkoutExpiresAt"),
    duplicatePaymentCount: number(value, "duplicatePaymentCount"),
  };
}

async function requestJson(auth: FirebaseAuthService, path: string, init?: RequestInit, allowMissing = false): Promise<unknown> {
  const { response } = await auth.firestoreRequest(path, init);
  if (allowMissing && response.status === 404) return null;
  const result = await response.json().catch(() => ({})) as JsonRecord;
  if (!response.ok) {
    if (response.status === 403) throw new Error("Billing orders are available only to GetGo administrators.");
    const message = (result.error as { message?: string } | undefined)?.message;
    throw new Error(message ?? `Firestore returned HTTP ${response.status}.`);
  }
  return result;
}

async function loadDocument(auth: FirebaseAuthService, collection: string, id: string): Promise<FirestoreDocument | null> {
  if (!id || id.includes("/")) return null;
  return await requestJson(auth, `/${collection}/${encodeURIComponent(id)}`, undefined, true) as FirestoreDocument | null;
}

async function queryDocuments(auth: FirebaseAuthService, structuredQuery: JsonRecord): Promise<FirestoreDocument[]> {
  const result = await requestJson(auth, ":runQuery", { method: "POST", body: JSON.stringify({ structuredQuery }) });
  return (Array.isArray(result) ? result : []).map((row) => (row as { document?: FirestoreDocument }).document)
    .filter((document): document is FirestoreDocument => Boolean(document));
}

const encodeCursor = (cursor: OrderCursor): string => Buffer.from(JSON.stringify(cursor)).toString("base64url");
const decodeCursor = (cursor?: string): OrderCursor | null => {
  if (!cursor) return null;
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as OrderCursor;
    if (!value.documentName || !value.createdAt) throw new Error();
    return value;
  } catch { throw new Error("Invalid billing-order cursor."); }
};

function matchesFilters(order: BillingOrderListItem, query: BillingOrderQuery): boolean {
  return (!query.status || order.status === query.status)
    && (!query.purchaseType || order.purchaseType === query.purchaseType)
    && (!query.environment || order.environment === query.environment);
}

async function searchOrders(auth: FirebaseAuthService, query: BillingOrderQuery, limit: number, defaultEnvironment: string): Promise<BillingOrderPage> {
  const search = query.search!.trim();
  const found = new Map<string, FirestoreDocument>();
  const direct = await loadDocument(auth, "getgo-billing-orders", search);
  if (direct) found.set(direct.name, direct);
  const equalitySearch = async (fieldPath: string, value: string) => queryDocuments(auth, {
    from: [{ collectionId: "getgo-billing-orders" }],
    where: { fieldFilter: { field: { fieldPath }, op: "EQUAL", value: field.string(value) } },
    limit,
  });
  const results = await Promise.all([equalitySearch("transactionId", search), equalitySearch("parentUid", search)]);
  results.flat().forEach((document) => found.set(document.name, document));
  if (search.includes("@")) {
    const users = await queryDocuments(auth, {
      from: [{ collectionId: "getgo" }],
      where: { fieldFilter: { field: { fieldPath: "email" }, op: "EQUAL", value: field.string(search.toLocaleLowerCase()) } },
      limit: 10,
    });
    const byUsers = await Promise.all(users.map((user) => equalitySearch("parentUid", documentId(user.name))));
    byUsers.flat().forEach((document) => found.set(document.name, document));
  }
  const items = [...found.values()].map((document) => orderFromDocument(document, defaultEnvironment)).filter((order) => matchesFilters(order, query))
    .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt))).slice(0, limit);
  return { items, nextCursor: null };
}

export async function listBillingOrders(auth: FirebaseAuthService, query: BillingOrderQuery): Promise<BillingOrderPage> {
  const context = await auth.authorizationContext();
  const defaultEnvironment = context.environment === "production" ? "production" : "sandbox";
  const limit = Math.max(1, Math.min(100, Math.trunc(query.limit ?? 25)));
  if (query.status && !statuses.has(query.status)) throw new Error("Invalid billing status filter.");
  if (query.purchaseType && query.purchaseType !== "subscription" && query.purchaseType !== "topic") throw new Error("Invalid purchase type filter.");
  if (query.search?.trim()) return searchOrders(auth, query, limit, defaultEnvironment);
  let cursor = decodeCursor(query.cursor);
  const items: BillingOrderListItem[] = [];
  let hasMore = false;
  for (let page = 0; page < 10 && items.length < limit; page += 1) {
    const batchSize = Math.max(50, Math.min(200, limit * 3));
    const documents = await queryDocuments(auth, {
      from: [{ collectionId: "getgo-billing-orders" }],
      orderBy: [{ field: { fieldPath: "createdAt" }, direction: "DESCENDING" }, { field: { fieldPath: "__name__" }, direction: "DESCENDING" }],
      ...(cursor ? { startAt: { before: false, values: [field.timestamp(cursor.createdAt), field.reference(cursor.documentName)] } } : {}),
      limit: batchSize,
    });
    if (!documents.length) { hasMore = false; break; }
    for (let index = 0; index < documents.length; index += 1) {
      const document = documents[index];
      const order = orderFromDocument(document, defaultEnvironment);
      cursor = { documentName: document.name, createdAt: order.createdAt ?? "" };
      if (matchesFilters(order, query)) items.push(order);
      if (items.length === limit) { hasMore = index < documents.length - 1 || documents.length === batchSize; break; }
    }
    if (items.length === limit) break;
    hasMore = documents.length === batchSize;
    if (!hasMore) break;
  }
  return { items, nextCursor: hasMore && cursor ? encodeCursor(cursor) : null };
}

function transactionFromDocument(document: FirestoreDocument | null): BillingOrderTransaction | null {
  if (!document) return null;
  const value = recordFromDocument(document);
  return { id: documentId(document.name), status: status(value.status), providerTransactionId: string(value, "providerTransactionId"),
    referenceNumber: string(value, "referenceNumber"), providerTransactionTime: timestamp(value, "providerTransactionTime"),
    paidAt: timestamp(value, "paidAt"), failedAt: timestamp(value, "failedAt"), cancelledAt: timestamp(value, "cancelledAt"),
    expiredAt: timestamp(value, "expiredAt"), updatedAt: timestamp(value, "updatedAt") };
}

function userFromDocument(document: FirestoreDocument | null): BillingOrderUser | null {
  if (!document) return null;
  const value = recordFromDocument(document);
  return { id: documentId(document.name), name: string(value, "name"), email: string(value, "email"), packageId: string(value, "packageId"), subscriptionExpiresAt: timestamp(value, "subscriptionExpiresAt") };
}

function productFromDocument(document: FirestoreDocument | null): BillingOrderProduct | null {
  if (!document) return null;
  const value = recordFromDocument(document); const price = value.price && typeof value.price === "object" ? value.price as JsonRecord : {};
  return { id: documentId(document.name), name: localizedName(value.name) || localizedName(value.title), type: string(value, "type"), amount: typeof price.amount === "number" ? price.amount : null, currency: string(price, "currency") };
}

function accessFromDocument(document: FirestoreDocument | null, kind: "subscription" | "topic"): BillingOrderAccess | null {
  if (!document) return null;
  const value = recordFromDocument(document);
  return { kind, id: documentId(document.name), status: string(value, "status"), startsAt: timestamp(value, "startsAt"), expiresAt: timestamp(value, "expiresAt"), grantedAt: timestamp(value, "grantedAt") || timestamp(value, "paidAt") };
}

function eventFromDocument(document: FirestoreDocument): BillingOrderEvent {
  const value = recordFromDocument(document);
  const { event, createdAt, success, direction, endpoint, httpStatus, durationMs, expiresAt, schemaVersion, provider, transactionId, orderId, parentUid, environment, ...detail } = value;
  void expiresAt; void schemaVersion; void provider; void transactionId; void orderId; void parentUid; void environment;
  return { id: documentId(document.name), event: typeof event === "string" ? event : "unknown", createdAt: typeof createdAt === "string" ? createdAt : null,
    success: typeof success === "boolean" ? success : null, direction: typeof direction === "string" ? direction : "", endpoint: typeof endpoint === "string" ? endpoint : "",
    httpStatus: typeof httpStatus === "number" ? httpStatus : null, durationMs: typeof durationMs === "number" ? durationMs : null, detail };
}

function duplicateFromDocument(document: FirestoreDocument): BillingDuplicatePayment {
  const value = recordFromDocument(document);
  return { id: documentId(document.name), status: string(value, "status"), providerTransactionId: string(value, "providerTransactionId"), amount: number(value, "amount"),
    referenceNumber: string(value, "referenceNumber"), providerTransactionTime: timestamp(value, "providerTransactionTime"), createdAt: timestamp(value, "createdAt") };
}

export function billingOrderWarnings(detail: Omit<BillingOrderDetail, "warnings">, now = Date.now()): BillingOrderWarningCode[] {
  const warnings: BillingOrderWarningCode[] = [];
  if (!detail.transaction) warnings.push("missing-transaction");
  else if (detail.transaction.status !== detail.order.status) warnings.push("status-mismatch");
  if (!detail.user) warnings.push("missing-user");
  if (!detail.product) warnings.push("missing-product");
  if (detail.order.status === "paid" && !detail.access) warnings.push("missing-access");
  if (detail.order.status === "pending" && !detail.pending) warnings.push("missing-pending");
  if (detail.order.status === "pending" && detail.order.checkoutExpiresAt && Date.parse(detail.order.checkoutExpiresAt) <= now) warnings.push("stale-pending");
  if (detail.order.duplicatePaymentCount !== detail.duplicatePayments.length) warnings.push("duplicate-count-mismatch");
  return warnings;
}

export async function loadBillingOrderDetail(auth: FirebaseAuthService, orderId: string): Promise<BillingOrderDetail> {
  if (!orderId || orderId.includes("/")) throw new Error("Invalid billing order ID.");
  const context = await auth.authorizationContext();
  const orderDocument = await loadDocument(auth, "getgo-billing-orders", orderId);
  if (!orderDocument) throw new Error("Billing order not found.");
  const order = orderFromDocument(orderDocument, context.environment === "production" ? "production" : "sandbox");
  const equality = (collectionId: string) => queryDocuments(auth, { from: [{ collectionId }], where: { fieldFilter: { field: { fieldPath: "orderId" }, op: "EQUAL", value: field.string(order.id) } }, limit: 500 });
  const [transactionDocument, userDocument, productDocument, pendingDocument, eventDocuments, duplicateDocuments] = await Promise.all([
    loadDocument(auth, "getgo-billing-transactions", order.transactionId), loadDocument(auth, "getgo", order.parentUid),
    loadDocument(auth, order.purchaseType === "topic" ? "getgo-marketplace-topics" : "getgo-payment-packages", order.purchaseType === "topic" ? order.topicId ?? "" : order.productId),
    loadDocument(auth, "getgo-billing-pending", order.transactionId), equality("getgo-billing-events"), equality("getgo-billing-duplicate-payments"),
  ]);
  const accessDocument = order.purchaseType === "topic"
    ? await loadDocument(auth, `getgo/${encodeURIComponent(order.parentUid)}/topicEntitlements`, order.topicId ?? "")
    : await loadDocument(auth, `getgo/${encodeURIComponent(order.parentUid)}/subscriptions`, "family_premium");
  const partial = {
    order, transaction: transactionFromDocument(transactionDocument), user: userFromDocument(userDocument), product: productFromDocument(productDocument),
    access: accessFromDocument(accessDocument, order.purchaseType === "topic" ? "topic" : "subscription"), pending: Boolean(pendingDocument),
    duplicatePayments: duplicateDocuments.map(duplicateFromDocument).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))),
    events: eventDocuments.map(eventFromDocument).sort((a, b) => {
      const byTime = String(a.createdAt).localeCompare(String(b.createdAt));
      return byTime || a.id.localeCompare(b.id);
    }),
  } satisfies Omit<BillingOrderDetail, "warnings">;
  return { ...partial, warnings: billingOrderWarnings(partial) };
}
