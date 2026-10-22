import { createPrivateKey, createSign } from "node:crypto";
import { promises as fs } from "node:fs";
import type { PaymentEvent, PaymentPackage } from "../../../shared/domain/models.js";
import { paymentEventIsActive } from "../domain/payment-event.js";

type Sale = Extract<PaymentEvent, { type: "sale" }>;
type JsonApiResource = { id: string; type: string; attributes?: Record<string, unknown>; relationships?: Record<string, { data?: { id: string } }> };
type JsonApiResponse = { data: JsonApiResource | JsonApiResource[]; included?: JsonApiResource[] };
export type NativeOfferSyncResult = { apple: number; google: number; skipped: string[] };
export const unexpectedStoreOffers = <T>(existing: T[], allowedKeys: Set<string>, key: (item: T) => string) => existing.filter(item => !allowedKeys.has(key(item)));

const asPem = async (value: string) => value.includes("BEGIN PRIVATE KEY") ? value.replace(/\\n/g, "\n") : fs.readFile(value, "utf8");
const base64Url = (value: string | Buffer) => Buffer.from(value).toString("base64url");

export function targetNativePackages(event: Sale, packages: PaymentPackage[]): PaymentPackage[] {
  const selected = packages.filter(item => event.targets.packageIds.includes(item.id));
  const types = new Set(selected.map(item => item.type));
  return packages.filter(item => item.platform !== "web" && types.has(item.type) && item.type !== "free");
}

function appleToken(issuerId: string, keyId: string, privateKey: string) {
  const header = base64Url(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" }));
  const payload = base64Url(JSON.stringify({ iss: issuerId, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 900, aud: "appstoreconnect-v1" }));
  const signer = createSign("SHA256"); signer.update(`${header}.${payload}`); signer.end();
  return `${header}.${payload}.${signer.sign({ key: createPrivateKey(privateKey), dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
}

class AppleClient {
  constructor(private readonly token: string) {}
  private async request(path: string, init?: RequestInit): Promise<JsonApiResponse> {
    const response = await fetch(`https://api.appstoreconnect.apple.com${path}`, { ...init, headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json", ...init?.headers } });
    if (!response.ok) throw new Error(`App Store Connect ${init?.method ?? "GET"} ${path} failed (${response.status}): ${await response.text()}`);
    return response.status === 204 ? { data: [] } : response.json() as Promise<JsonApiResponse>;
  }
  async subscriptions(bundleId: string): Promise<Map<string, string>> {
    const apps = await this.request(`/v1/apps?filter%5BbundleId%5D=${encodeURIComponent(bundleId)}&limit=1`);
    const app = Array.isArray(apps.data) ? apps.data[0] : apps.data;
    if (!app) throw new Error(`App Store Connect app ${bundleId} was not found.`);
    const groups = await this.request(`/v1/apps/${app.id}/subscriptionGroups?include=subscriptions&limit=200&limit%5Bsubscriptions%5D=200`);
    return new Map((groups.included ?? []).filter(item => item.type === "subscriptions").map(item => [String(item.attributes?.productId), item.id]));
  }
  private async pricePoint(subscriptionId: string, amount: number, discountPercent: number) {
    const response = await this.request(`/v1/subscriptions/${subscriptionId}/pricePoints?filter%5Bterritory%5D=VNM&limit=200`);
    const points = (Array.isArray(response.data) ? response.data : [response.data]).filter(Boolean);
    const target = amount * (100 - discountPercent) / 100;
    const point = points.sort((a, b) => Math.abs(Number(a.attributes?.customerPrice) - target) - Math.abs(Number(b.attributes?.customerPrice) - target))[0];
    if (!point) throw new Error(`No Vietnam App Store price point is available for subscription ${subscriptionId}.`);
    return point.id;
  }
  async reconcile(subscriptionId: string, events: Sale[]) {
    const response = await this.request(`/v1/subscriptions/${subscriptionId}/introductoryOffers?filter%5Bterritory%5D=VNM&limit=200`);
    const existing = (Array.isArray(response.data) ? response.data : [response.data]).filter(Boolean);
    const allowed = new Set(events.filter(event => event.enabled).map(event => `${event.startsOn}:${event.endsOn}`));
    for (const offer of unexpectedStoreOffers(existing, allowed, item => `${item.attributes?.startDate}:${item.attributes?.endDate}`)) await this.request(`/v1/subscriptionIntroductoryOffers/${offer.id}`, { method: "DELETE" });
  }
  async sync(event: Sale, pkg: PaymentPackage, subscriptionId: string) {
    const existingResponse = await this.request(`/v1/subscriptions/${subscriptionId}/introductoryOffers?filter%5Bterritory%5D=VNM&include=subscriptionPricePoint&limit=200`);
    const existing = (Array.isArray(existingResponse.data) ? existingResponse.data : [existingResponse.data]).filter(Boolean);
    const sameWindow = existing.filter(offer => offer.attributes?.startDate === event.startsOn && offer.attributes?.endDate === event.endsOn);
    if (!event.enabled) { for (const offer of sameWindow) await this.request(`/v1/subscriptionIntroductoryOffers/${offer.id}`, { method: "DELETE" }); return; }
    const pricePointId = await this.pricePoint(subscriptionId, pkg.price.amount, event.discountPercent);
    const matching = sameWindow.some(offer => offer.relationships?.subscriptionPricePoint?.data?.id === pricePointId && offer.attributes?.numberOfPeriods === 1);
    if (matching) return;
    for (const offer of sameWindow) await this.request(`/v1/subscriptionIntroductoryOffers/${offer.id}`, { method: "DELETE" });
    await this.request("/v1/subscriptionIntroductoryOffers", { method: "POST", body: JSON.stringify({ data: { type: "subscriptionIntroductoryOffers", attributes: { startDate: event.startsOn, endDate: event.endsOn, duration: pkg.type === "annual" ? "ONE_YEAR" : "ONE_MONTH", offerMode: "PAY_AS_YOU_GO", numberOfPeriods: 1 }, relationships: { subscription: { data: { type: "subscriptions", id: subscriptionId } }, territory: { data: { type: "territories", id: "VNM" } }, subscriptionPricePoint: { data: { type: "subscriptionPricePoints", id: pricePointId } } } } }) });
  }
}

type GoogleCredentials = { client_email: string; private_key: string; token_uri?: string };
async function googleCredentials(value: string): Promise<GoogleCredentials> {
  return JSON.parse(value.trim().startsWith("{") ? value : await fs.readFile(value, "utf8")) as GoogleCredentials;
}
async function googleToken(credentials: GoogleCredentials) {
  const now = Math.floor(Date.now() / 1000); const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify({ iss: credentials.client_email, scope: "https://www.googleapis.com/auth/androidpublisher", aud: credentials.token_uri ?? "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const signer = createSign("RSA-SHA256"); signer.update(`${header}.${payload}`); signer.end();
  const assertion = `${header}.${payload}.${signer.sign(credentials.private_key).toString("base64url")}`;
  const response = await fetch(credentials.token_uri ?? "https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }) });
  if (!response.ok) throw new Error(`Google Play authentication failed (${response.status}): ${await response.text()}`);
  return String((await response.json() as { access_token: string }).access_token);
}

class GoogleClient {
  constructor(private readonly token: string, private readonly packageName: string) {}
  private async request(path: string, init?: RequestInit, allowMissing = false) {
    const response = await fetch(`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${this.packageName}${path}`, { ...init, headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json", ...init?.headers } });
    if (allowMissing && response.status === 404) return null;
    if (!response.ok) throw new Error(`Google Play ${init?.method ?? "GET"} ${path} failed (${response.status}): ${await response.text()}`);
    return response.status === 204 ? null : response.json();
  }
  async reconcile(pkg: PaymentPackage, events: Sale[]) {
    if (!pkg.storeProductId || !pkg.storeBasePlanId) throw new Error(`Android package ${pkg.id} requires a product ID and base plan ID.`);
    const root = `/subscriptions/${pkg.storeProductId}/basePlans/${pkg.storeBasePlanId}/offers`;
    const offers: Array<{ offerId: string; state: string }> = [];
    let pageToken = "";
    do {
      const query = new URLSearchParams({ pageSize: "100", ...(pageToken ? { pageToken } : {}) });
      const response = await this.request(`${root}?${query}`) as { subscriptionOffers?: Array<{ offerId: string; state: string }>; nextPageToken?: string };
      offers.push(...(response.subscriptionOffers ?? [])); pageToken = response.nextPageToken ?? "";
    } while (pageToken);
    const allowed = new Set(events.filter(event => event.enabled).map(event => `getgo-${event.id}`.slice(0, 50)));
    for (const offer of unexpectedStoreOffers(offers, allowed, item => item.offerId)) {
      const path = `${root}/${offer.offerId}`;
      if (offer.state === "DRAFT") await this.request(path, { method: "DELETE" });
      else if (offer.state === "ACTIVE") await this.request(`${path}:deactivate`, { method: "POST", body: "{}" });
    }
  }
  async sync(event: Sale, pkg: PaymentPackage) {
    if (!pkg.storeProductId || !pkg.storeBasePlanId) throw new Error(`Android package ${pkg.id} requires a product ID and base plan ID.`);
    const offerId = `getgo-${event.id}`.slice(0, 50); const root = `/subscriptions/${pkg.storeProductId}/basePlans/${pkg.storeBasePlanId}/offers/${offerId}`;
    const body = { packageName: this.packageName, productId: pkg.storeProductId, basePlanId: pkg.storeBasePlanId, offerId, phases: [{ recurrenceCount: 1, duration: pkg.type === "annual" ? "P1Y" : "P1M", regionalConfigs: [{ regionCode: "VN", relativeDiscount: (100 - event.discountPercent) / 100 }] }], targeting: { acquisitionRule: { scope: { anySubscriptionInApp: {} } } }, regionalConfigs: [{ regionCode: "VN", newSubscriberAvailability: true }], offerTags: [{ tag: "getgo-intro" }, { tag: event.id.slice(0, 20) }] };
    const existing = await this.request(root, undefined, true) as { state?: string } | null;
    if (existing) await this.request(`${root}?updateMask=phases,targeting,regionalConfigs,offerTags&regionsVersion.version=2022%2F02`, { method: "PATCH", body: JSON.stringify(body) });
    else await this.request(`/subscriptions/${pkg.storeProductId}/basePlans/${pkg.storeBasePlanId}/offers?offerId=${offerId}&regionsVersion.version=2022%2F02`, { method: "POST", body: JSON.stringify(body) });
    if (paymentEventIsActive(event)) await this.request(`${root}:activate`, { method: "POST", body: "{}" });
    else if (existing?.state === "ACTIVE") await this.request(`${root}:deactivate`, { method: "POST", body: "{}" });
  }
}

export async function syncNativeStoreOffers(events: PaymentEvent[], packages: PaymentPackage[]): Promise<NativeOfferSyncResult> {
  const sales = events.filter((event): event is Sale => event.type === "sale");
  const nativePackages = packages.filter(pkg => pkg.platform !== "web" && pkg.type !== "free");
  const salesFor = (pkg: PaymentPackage) => sales.filter(event => targetNativePackages(event, packages).some(target => target.id === pkg.id));
  const result: NativeOfferSyncResult = { apple: 0, google: 0, skipped: [] };
  const applePackages = nativePackages.filter(pkg => pkg.platform === "ios");
  if (applePackages.length) {
    const issuer = process.env.GETGO_APP_STORE_CONNECT_ISSUER_ID; const keyId = process.env.GETGO_APP_STORE_CONNECT_KEY_ID; const key = process.env.GETGO_APP_STORE_CONNECT_PRIVATE_KEY;
    if (!issuer || !keyId || !key) result.skipped.push("Apple offers: App Store Connect credentials are not configured.");
    else {
      const client = new AppleClient(appleToken(issuer, keyId, await asPem(key))); const subscriptions = await client.subscriptions(process.env.GETGO_IOS_BUNDLE_ID ?? "com.tnpglobal.getgo");
      for (const pkg of applePackages) { const id = subscriptions.get(pkg.storeProductId ?? ""); if (!id) throw new Error(`App Store subscription ${pkg.storeProductId} was not found.`); const desired = salesFor(pkg); await client.reconcile(id, desired); for (const event of desired.filter(item => item.enabled)) { await client.sync(event, pkg, id); result.apple += 1; } }
    }
  }
  const googlePackages = nativePackages.filter(pkg => pkg.platform === "android");
  if (googlePackages.length) {
    const source = process.env.GETGO_GOOGLE_PLAY_SERVICE_ACCOUNT;
    if (!source) result.skipped.push("Google offers: Google Play service-account credentials are not configured.");
    else { const client = new GoogleClient(await googleToken(await googleCredentials(source)), process.env.GETGO_ANDROID_PACKAGE_NAME ?? "com.tnp.getgo"); for (const pkg of googlePackages) { const desired = salesFor(pkg); await client.reconcile(pkg, desired); for (const event of desired.filter(item => item.enabled)) { await client.sync(event, pkg); result.google += 1; } } }
  }
  return result;
}
