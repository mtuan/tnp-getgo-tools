import type { IpcMain } from "electron";
import type { FirebaseAuthService } from "../../authentication/main/firebase-auth.js";
import type { BillingOrderQuery } from "../../../shared/domain/models.js";
import { listBillingOrders, loadBillingOrderDetail } from "./billing-order-read-service.js";

export function registerBillingOrdersIpc(ipcMain: IpcMain, auth: FirebaseAuthService): void {
  ipcMain.handle("billing-orders:list", (_event, input: unknown) => {
    if (input != null && (typeof input !== "object" || Array.isArray(input))) throw new Error("Invalid billing-order query.");
    const query = (input ?? {}) as BillingOrderQuery;
    if (query.search != null && typeof query.search !== "string") throw new Error("Invalid billing-order search.");
    if (query.cursor != null && typeof query.cursor !== "string") throw new Error("Invalid billing-order cursor.");
    return listBillingOrders(auth, query);
  });
  ipcMain.handle("billing-orders:detail", (_event, orderId: unknown) => {
    if (typeof orderId !== "string" || !orderId || orderId.includes("/")) throw new Error("Invalid billing order ID.");
    return loadBillingOrderDetail(auth, orderId);
  });
}
