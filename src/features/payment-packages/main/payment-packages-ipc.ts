import { promises as fs } from "node:fs";
import path from "node:path";
import type { IpcMain } from "electron";
import { paymentPackagesSchema } from "../domain/payment-package.js";
import { paymentEventsSchema } from "../domain/payment-event.js";
import type { FirestorePublishingService } from "../../topics/main/firestore-publishing.js";
import { assertRepositoryContentSafe, warnForRepositoryContent } from "../../content-safety/repository/content-safety-repository.js";
import type { GetGoAccessPolicyService } from "./access-policy-service.js";
import type { AppSettings, PaymentEvent, PaymentPackage } from "../../../shared/domain/models.js";
import type { VietQrConfigurationInput, VietQrRuntimeStatus } from "../../../shared/domain/models.js";
import type { FirebaseAuthService } from "../../authentication/main/firebase-auth.js";
import type { FullReleaseJobManager } from "../../deployment/main/full-release-jobs.js";
import { paymentEventsForEnvironment, paymentPackagesForEnvironment } from "../domain/payment-environment.js";
import { syncNativeStoreOffers } from "./native-store-offers.js";

const filePath = (root: string) => path.join(root, "content-v2", "payment-packages.json");
const eventsFilePath = (root: string) => path.join(root, "content-v2", "payment-events.json");
const legacySalesFilePath = (root: string) => path.join(root, "content-v2", "payment-sales.json");
function expandNativeSaleTargets(events: PaymentEvent[], packages: PaymentPackage[]): PaymentEvent[] {
  return events.map(event => {
    if (event.type !== "sale") return event;
    const selectedTypes = new Set(packages.filter(item => event.targets.packageIds.includes(item.id)).map(item => item.type));
    const nativeIds = packages.filter(item => item.platform !== "web" && selectedTypes.has(item.type)).map(item => item.id);
    return { ...event, targets: { packageIds: [...new Set([...event.targets.packageIds, ...nativeIds])] } };
  });
}
async function load(root: string) {
  try { return paymentPackagesSchema.parse(JSON.parse(await fs.readFile(filePath(root), "utf8"))); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
}
async function save(root: string, value: unknown) {
  const packages = paymentPackagesSchema.parse(value);
  await warnForRepositoryContent(root, "content-v2/payment-packages.json", packages);
  await fs.mkdir(path.dirname(filePath(root)), { recursive: true });
  await fs.writeFile(filePath(root), `${JSON.stringify(packages, null, 2)}\n`, "utf8");
  return packages;
}
export function registerPaymentPackagesIpc(ipcMain: IpcMain, dependencies: { repositoryRoot(): Promise<string>; publishing: FirestorePublishingService; accessPolicy: GetGoAccessPolicyService; targetEnvironment(): Promise<AppSettings["environment"]>; firebaseAuth: FirebaseAuthService; releases: FullReleaseJobManager }) {
  ipcMain.handle("payment-packages:list", async () => load(await dependencies.repositoryRoot()));
  ipcMain.handle("payment-packages:save", async (_event, value: unknown) => save(await dependencies.repositoryRoot(), value));
  ipcMain.handle("payment-packages:sync", async () => {
    const packages = await load(await dependencies.repositoryRoot());
    await assertRepositoryContentSafe(await dependencies.repositoryRoot(), "Payment packages", packages);
    const environment = await dependencies.targetEnvironment();
    const targeted = paymentPackagesForEnvironment(packages, environment);
    await dependencies.publishing.publishPaymentPackages(targeted);
    return { count: targeted.length, syncedAt: new Date().toISOString() };
  });
  const runtimeStatus = async (): Promise<VietQrRuntimeStatus> => {
    const { response } = await dependencies.firebaseAuth.firestoreRequest("/getgo-config/payment-runtime");
    if (response.status === 404) return { enabled: false, configuredAt: null, configuredBy: null, environment: null, bankAccountLast4: null };
    const payload = await response.json().catch(() => ({})) as { fields?: Record<string, { mapValue?: { fields?: Record<string, { booleanValue?: boolean; stringValue?: string }> } }> };
    if (!response.ok) throw new Error(`Could not load VietQR runtime status (HTTP ${response.status}).`);
    const fields = payload.fields?.vietqr?.mapValue?.fields ?? {};
    return {
      enabled: fields.enabled?.booleanValue === true,
      configuredAt: fields.configuredAt?.stringValue ?? null,
      configuredBy: fields.configuredBy?.stringValue ?? null,
      environment: fields.environment?.stringValue === "production" ? "production" : fields.environment?.stringValue === "sandbox" ? "sandbox" : null,
      bankAccountLast4: fields.bankAccountLast4?.stringValue ?? null,
    };
  };
  const writeRuntimeStatus = async (status: VietQrRuntimeStatus) => {
    const { response } = await dependencies.firebaseAuth.firestoreRequest("/getgo-config/payment-runtime?updateMask.fieldPaths=vietqr", {
      method: "PATCH",
      body: JSON.stringify({ fields: { vietqr: { mapValue: { fields: {
        enabled: { booleanValue: status.enabled },
        configuredAt: status.configuredAt ? { stringValue: status.configuredAt } : { nullValue: null },
        configuredBy: status.configuredBy ? { stringValue: status.configuredBy } : { nullValue: null },
        environment: status.environment ? { stringValue: status.environment } : { nullValue: null },
        bankAccountLast4: status.bankAccountLast4 ? { stringValue: status.bankAccountLast4 } : { nullValue: null },
      } } } } }),
    });
    if (!response.ok) throw new Error(`Could not update VietQR runtime status (HTTP ${response.status}).`);
    return status;
  };
  ipcMain.handle("vietqr-runtime:status", runtimeStatus);
  ipcMain.handle("vietqr-runtime:configure", async (_event, value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid VietQR configuration.");
    const input = value as VietQrConfigurationInput;
    const environment = await dependencies.targetEnvironment();
    const result = await dependencies.releases.configureVietQr(environment, input);
    const auth = await dependencies.firebaseAuth.authorizationContext();
    return writeRuntimeStatus({ enabled: true, configuredAt: new Date().toISOString(), configuredBy: auth.email, environment: result.environment, bankAccountLast4: result.bankAccountLast4 });
  });
  ipcMain.handle("vietqr-runtime:disable", async () => {
    const current = await runtimeStatus();
    return writeRuntimeStatus({ ...current, enabled: false });
  });
  ipcMain.handle("getgo-access-policy:load", () => dependencies.accessPolicy.load());
  ipcMain.handle("getgo-access-policy:save", (_event, value: unknown) => dependencies.accessPolicy.save(value));
  const loadEvents = async (root: string) => {
    try { return paymentEventsSchema.parse(JSON.parse(await fs.readFile(eventsFilePath(root), "utf8"))); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      try {
        const legacy = JSON.parse(await fs.readFile(legacySalesFilePath(root), "utf8")) as Array<Record<string, unknown>>;
        return paymentEventsSchema.parse(legacy.map(({ packageIds, ...sale }) => ({ ...sale, type: "sale", targets: { packageIds } })));
      } catch (legacyError) {
        if ((legacyError as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw legacyError;
      }
    }
  };
  ipcMain.handle("payment-events:list", async () => loadEvents(await dependencies.repositoryRoot()));
  ipcMain.handle("payment-events:save", async (_event, value: unknown) => {
    const events = paymentEventsSchema.parse(value);
    const root = await dependencies.repositoryRoot();
    await warnForRepositoryContent(root, "content-v2/payment-events.json", events);
    const target = eventsFilePath(root);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, `${JSON.stringify(events, null, 2)}\n`, "utf8");
    return events;
  });
  ipcMain.handle("payment-events:sync", async () => {
    const root = await dependencies.repositoryRoot();
    const events = await loadEvents(root);
    await assertRepositoryContentSafe(root, "Payment events", events);
    const environment = await dependencies.targetEnvironment();
    const allPackages = await load(root);
    const targetedPackages = allPackages.filter(item => item.targetEnvironments.includes(environment));
    const expanded = expandNativeSaleTargets(events.filter(item => item.targetEnvironments.includes(environment)), targetedPackages);
    const targeted = paymentEventsForEnvironment(expanded, environment);
    await dependencies.publishing.publishPaymentEvents(targeted as Array<Record<string, unknown>>);
    const nativeOffers = environment === "production"
      ? await syncNativeStoreOffers(expanded, targetedPackages)
      : { apple: 0, google: 0, skipped: [] };
    return { count: targeted.length, syncedAt: new Date().toISOString(), nativeOffers };
  });
}
