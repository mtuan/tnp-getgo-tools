import { promises as fs } from "node:fs";
import path from "node:path";
import type { IpcMain } from "electron";
import { paymentPackagesSchema } from "../domain/payment-package.js";
import type { FirestorePublishingService } from "../../topics/main/firestore-publishing.js";

const filePath = (root: string) => path.join(root, "content-v2", "payment-packages.json");
async function load(root: string) {
  try { return paymentPackagesSchema.parse(JSON.parse(await fs.readFile(filePath(root), "utf8"))); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
}
async function save(root: string, value: unknown) {
  const packages = paymentPackagesSchema.parse(value);
  await fs.mkdir(path.dirname(filePath(root)), { recursive: true });
  await fs.writeFile(filePath(root), `${JSON.stringify(packages, null, 2)}\n`, "utf8");
  return packages;
}
export function registerPaymentPackagesIpc(ipcMain: IpcMain, dependencies: { repositoryRoot(): Promise<string>; publishing: FirestorePublishingService }) {
  ipcMain.handle("payment-packages:list", async () => load(await dependencies.repositoryRoot()));
  ipcMain.handle("payment-packages:save", async (_event, value: unknown) => save(await dependencies.repositoryRoot(), value));
  ipcMain.handle("payment-packages:sync", async () => {
    const packages = await load(await dependencies.repositoryRoot());
    await dependencies.publishing.publishPaymentPackages(packages);
    return { count: packages.length, syncedAt: new Date().toISOString() };
  });
}
