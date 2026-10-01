import { randomUUID } from "node:crypto";
import type { IpcMain } from "electron";
import type { FirebaseAuthService } from "../../authentication/main/firebase-auth.js";
import type { GetGoMemberAccount, GetGoMemberPage, GetGoMemberQuery, GetGoMembershipTier } from "../../../shared/domain/models.js";

type FirestoreValue = {
  stringValue?: string;
  referenceValue?: string;
  timestampValue?: string;
  nullValue?: null;
  arrayValue?: { values?: FirestoreValue[] };
};
type FirestoreDocument = { name: string; fields?: Record<string, FirestoreValue> };

const stringValue = (value?: FirestoreValue): string => value?.stringValue ?? "";
const stringArray = (value?: FirestoreValue): string[] => value?.arrayValue?.values?.map(stringValue).filter(Boolean) ?? [];
const documentId = (name: string): string => decodeURIComponent(name.split("/").at(-1) ?? "");
const field = {
  string: (value: string): FirestoreValue => ({ stringValue: value }),
  timestamp: (value: string): FirestoreValue => ({ timestampValue: value }),
  null: (): FirestoreValue => ({ nullValue: null }),
  strings: (values: string[]): FirestoreValue => ({ arrayValue: { values: values.map((value) => ({ stringValue: value })) } }),
};

async function payload(auth: FirebaseAuthService, path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const { response } = await auth.firestoreRequest(path, init);
  const result = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const message = (result.error as { message?: string } | undefined)?.message;
    throw new Error(message ?? `Firestore returned HTTP ${response.status}.`);
  }
  return result;
}

type MemberCursor = { documentName: string; name?: string };
const encodeCursor = (cursor: MemberCursor): string => Buffer.from(JSON.stringify(cursor)).toString("base64url");
const decodeCursor = (cursor?: string): MemberCursor | null => {
  if (!cursor) return null;
  try { return JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as MemberCursor; }
  catch { throw new Error("Invalid member-page cursor."); }
};

function memberFromDocument(parent: FirestoreDocument): GetGoMemberAccount {
    const id = documentId(parent.name);
    const packageId = stringValue(parent.fields?.packageId);
    const membership: GetGoMembershipTier = packageId === "admin" ? "admin" : packageId === "premium" ? "premium" : "free";
    return {
      id,
      name: stringValue(parent.fields?.name),
      email: stringValue(parent.fields?.email),
      membership,
      accountStatus: "active",
      subscriptionStartsAt: parent.fields?.subscriptionStartsAt?.timestampValue ?? parent.fields?.subscriptionGrantedAt?.timestampValue ?? null,
      subscriptionExpiresAt: parent.fields?.subscriptionExpiresAt?.timestampValue ?? null,
    };
}

async function activeAccountIds(auth: FirebaseAuthService, memberIds: string[]): Promise<Set<string>> {
  if (!memberIds.length) return new Set();
  const target = await auth.publishingTarget();
  const chunks = Array.from({ length: Math.ceil(memberIds.length / 30) }, (_, index) => memberIds.slice(index * 30, index * 30 + 30));
  const results = await Promise.all(chunks.map((ids) => payload(auth, ":runQuery", {
    method: "POST",
    body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: "users" }],
      where: { fieldFilter: {
        field: { fieldPath: "__name__" },
        op: "IN",
        value: { arrayValue: { values: ids.map((id) => ({
          referenceValue: `projects/${target.projectId}/databases/(default)/documents/users/${id}`,
        })) } },
      } },
    } }),
  })));
  return new Set(results.flatMap((result) => (Array.isArray(result) ? result : []))
    .map((row) => (row as { document?: FirestoreDocument }).document?.name)
    .filter((name): name is string => Boolean(name))
    .map(documentId));
}

async function listMembers(auth: FirebaseAuthService, query: GetGoMemberQuery): Promise<GetGoMemberPage> {
  const limit = Math.max(1, Math.min(100, Math.trunc(query.limit ?? 50)));
  const search = query.search?.trim() ?? "";
  if (query.membership && !(["free", "premium", "admin"] as string[]).includes(query.membership)) throw new Error("Invalid membership filter.");
  if (/^[A-Za-z0-9_-]{20,}$/.test(search)) {
    const document = await payload(auth, `/getgo/${encodeURIComponent(search)}`).catch(() => null) as FirestoreDocument | null;
    const member = document?.name ? memberFromDocument(document) : null;
    if (member) {
      const activeIds = await activeAccountIds(auth, [member.id]);
      member.accountStatus = activeIds.has(member.id) ? "active" : "orphaned";
    }
    return { items: member && (!query.membership || member.membership === query.membership) ? [member] : [], nextCursor: null };
  }
  const cursor = decodeCursor(query.cursor);
  const filters: Array<Record<string, unknown>> = [];
  // Legacy free profiles may not have packageId. Keep their query bounded by
  // paging the canonical collection and classifying each returned document.
  if (query.membership && query.membership !== "free") filters.push({ fieldFilter: { field: { fieldPath: "packageId" }, op: "EQUAL", value: field.string(query.membership) } });
  const nameSearch = search && !search.includes("@");
  if (search.includes("@")) filters.push({ fieldFilter: { field: { fieldPath: "email" }, op: "EQUAL", value: field.string(search.toLocaleLowerCase()) } });
  if (nameSearch) {
    filters.push({ fieldFilter: { field: { fieldPath: "name" }, op: "GREATER_THAN_OR_EQUAL", value: field.string(search) } });
    filters.push({ fieldFilter: { field: { fieldPath: "name" }, op: "LESS_THAN", value: field.string(`${search}\uf8ff`) } });
  }
  const orderBy = nameSearch
    ? [{ field: { fieldPath: "name" }, direction: "ASCENDING" }, { field: { fieldPath: "__name__" }, direction: "ASCENDING" }]
    : [{ field: { fieldPath: "__name__" }, direction: "ASCENDING" }];
  const startAt = cursor ? { before: false, values: [
    ...(nameSearch ? [field.string(cursor.name ?? "")] : []),
    { referenceValue: cursor.documentName },
  ] } : undefined;
  const structuredQuery = {
    from: [{ collectionId: "getgo" }],
    ...(filters.length === 1 ? { where: filters[0] } : filters.length > 1 ? { where: { compositeFilter: { op: "AND", filters } } } : {}),
    orderBy,
    ...(startAt ? { startAt } : {}),
    limit: limit + 1,
  };
  const result = await payload(auth, ":runQuery", { method: "POST", body: JSON.stringify({ structuredQuery }) });
  const documents = (Array.isArray(result) ? result : [])
    .map((row) => (row as { document?: FirestoreDocument }).document)
    .filter((document): document is FirestoreDocument => Boolean(document));
  const pageDocuments = documents.slice(0, limit);
  const last = pageDocuments.at(-1);
  const activeIds = await activeAccountIds(auth, pageDocuments.map((document) => documentId(document.name)));
  const items = pageDocuments.map(memberFromDocument)
    .map((member) => ({ ...member, accountStatus: activeIds.has(member.id) ? "active" as const : "orphaned" as const }))
    .filter((member) => !query.membership || member.membership === query.membership);
  return {
    items,
    nextCursor: documents.length > limit && last ? encodeCursor({ documentName: last.name, name: stringValue(last.fields?.name) }) : null,
  };
}

function membershipDate(value: string | null | undefined, endOfDay = false): string | null {
  if (!value) return null;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid membership date.");
  return date.toISOString();
}

async function setMembership(auth: FirebaseAuthService, memberId: string, membership: GetGoMembershipTier, startsAt?: string | null, expiresAt?: string | null): Promise<void> {
  if (!memberId || !(["free", "premium", "admin"] as string[]).includes(membership)) throw new Error("Invalid membership update.");
  const context = await auth.authorizationContext();
  if (context.uid === memberId && membership !== "admin") throw new Error("You cannot remove your own administrator access.");
  const parentDocument = await payload(auth, `/getgo/${encodeURIComponent(memberId)}`) as unknown as FirestoreDocument;
  if (!parentDocument.name) throw new Error("The selected GetGo member no longer exists.");
  const member = memberFromDocument(parentDocument);

  const target = await auth.publishingTarget();
  const now = new Date().toISOString();
  const effectiveStart = membership === "premium" ? membershipDate(startsAt) ?? now : membership === "admin" ? now : null;
  const effectiveEnd = membership === "premium" ? membershipDate(expiresAt, true) : null;
  if (effectiveStart && effectiveEnd && effectiveEnd <= effectiveStart) throw new Error("Premium membership must end after it starts.");
  const usersName = `projects/${target.projectId}/databases/(default)/documents/users/${memberId}`;
  const parentName = `projects/${target.projectId}/databases/(default)/documents/getgo/${memberId}`;
  const auditName = `projects/${target.projectId}/databases/(default)/documents/getgo-admin-audit/${randomUUID()}`;
  const currentUser = await payload(auth, `/users/${encodeURIComponent(memberId)}`).catch(() => ({})) as { fields?: Record<string, FirestoreValue> };
  const currentGroups = stringArray(currentUser.fields?.groups);
  const subscriptionResult = await payload(auth, `/getgo/${encodeURIComponent(memberId)}/subscriptions?pageSize=300`);
  const activeSubscriptions = ((subscriptionResult.documents as FirestoreDocument[] | undefined) ?? [])
    .filter((document) => stringValue(document.fields?.status) === "active");
  const nextGroups = membership === "admin"
    ? [...new Set([...currentGroups, "admin"])]
    : currentGroups.filter((group) => group !== "admin");
  const subscriptionWrites: Array<Record<string, unknown>> = activeSubscriptions.map((document) => ({
    update: { name: document.name, fields: { status: field.string("cancelled"), endDate: field.timestamp(now) } },
    updateMask: { fieldPaths: ["status", "endDate"] },
  }));
  if (membership !== "free") {
    subscriptionWrites.push({
      update: { name: `projects/${target.projectId}/databases/(default)/documents/getgo/${memberId}/subscriptions/${randomUUID()}`, fields: {
        packageId: field.string(membership),
        status: field.string("active"),
        startDate: field.timestamp(effectiveStart ?? now),
        endDate: effectiveEnd ? field.timestamp(effectiveEnd) : field.null(),
        grantedBy: field.string(context.uid),
        grantedAt: field.timestamp(now),
        notes: field.string("Membership updated in GetGo Tools"),
      } },
    });
  }

  await payload(auth, ":commit", {
    method: "POST",
    body: JSON.stringify({ writes: [
      {
        update: { name: usersName, fields: { groups: field.strings(nextGroups) } },
        updateMask: { fieldPaths: ["groups"] },
      },
      {
        update: { name: parentName, fields: {
          packageId: field.string(membership),
          subscriptionStartsAt: effectiveStart ? field.timestamp(effectiveStart) : field.null(),
          subscriptionExpiresAt: effectiveEnd ? field.timestamp(effectiveEnd) : field.null(),
          subscriptionGrantedAt: membership === "free" ? field.null() : field.timestamp(now),
          isAdFree: { booleanValue: membership !== "free" },
          adFreeUpdatedAt: field.timestamp(now),
        } },
        updateMask: { fieldPaths: ["packageId", "subscriptionStartsAt", "subscriptionExpiresAt", "subscriptionGrantedAt", "isAdFree", "adFreeUpdatedAt"] },
      },
      ...subscriptionWrites,
      {
        update: { name: auditName, fields: {
          memberId: field.string(memberId),
          memberEmail: field.string(member.email),
          previousMembership: field.string(member.membership),
          membership: field.string(membership),
          startsAt: effectiveStart ? field.timestamp(effectiveStart) : field.null(),
          expiresAt: effectiveEnd ? field.timestamp(effectiveEnd) : field.null(),
          changedByUid: field.string(context.uid),
          changedByEmail: field.string(context.email),
          changedAt: field.timestamp(now),
        } },
      },
    ] }),
  });
}

export function registerMemberManagementIpc(ipcMain: IpcMain, auth: FirebaseAuthService): void {
  ipcMain.handle("members:list", (_event, query: unknown) => listMembers(auth, (query && typeof query === "object" ? query : {}) as GetGoMemberQuery));
  ipcMain.handle("members:set-membership", (_event, memberId: unknown, membership: unknown, startsAt: unknown, expiresAt: unknown) => {
    if (typeof memberId !== "string" || typeof membership !== "string") throw new Error("Invalid membership update.");
    if (startsAt != null && typeof startsAt !== "string") throw new Error("Invalid membership start date.");
    if (expiresAt != null && typeof expiresAt !== "string") throw new Error("Invalid membership end date.");
    return setMembership(auth, memberId, membership as GetGoMembershipTier, startsAt, expiresAt);
  });
}
