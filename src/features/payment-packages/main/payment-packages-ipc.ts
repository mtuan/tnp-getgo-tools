import { promises as fs } from "node:fs";
import path from "node:path";
import type { IpcMain } from "electron";
import { paymentPackagesSchema } from "../domain/payment-package.js";
import { paymentSalesSchema } from "../domain/payment-sale.js";
import type { FirestorePublishingService } from "../../topics/main/firestore-publishing.js";

const filePath = (root: string) => path.join(root, "content-v2", "payment-packages.json");
const salesFilePath = (root: string) => path.join(root, "content-v2", "payment-sales.json");
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
  const loadSales = async (root: string) => {
    try { return paymentSalesSchema.parse(JSON.parse(await fs.readFile(salesFilePath(root), "utf8"))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  };
  ipcMain.handle("payment-sales:list", async () => loadSales(await dependencies.repositoryRoot()));
  ipcMain.handle("payment-sales:save", async (_event, value: unknown) => {
    const sales = paymentSalesSchema.parse(value);
    const target = salesFilePath(await dependencies.repositoryRoot());
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, `${JSON.stringify(sales, null, 2)}\n`, "utf8");
    return sales;
  });
  ipcMain.handle("payment-sales:sync", async () => {
    const sales = await loadSales(await dependencies.repositoryRoot());
    await dependencies.publishing.publishPaymentSales(sales);
    return { count: sales.length, syncedAt: new Date().toISOString() };
  });
}
