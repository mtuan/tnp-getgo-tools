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
  ipcMain.handle("payment-reviews:list", async (_event, input: unknown) => {
    if (input != null && (typeof input !== "object" || Array.isArray(input))) throw new Error("Invalid payment-review query.");
    const query = (input ?? {}) as { cursor?: unknown; limit?: unknown };
    if (query.cursor != null && typeof query.cursor !== "string") throw new Error("Invalid payment-review cursor.");
    if (query.limit != null && (!Number.isInteger(query.limit) || Number(query.limit) < 1 || Number(query.limit) > 100)) throw new Error("Invalid payment-review limit.");
    return auth.callableRequest("adminListGetGoPaymentReviews", { cursor: query.cursor, limit: query.limit });
  });
  ipcMain.handle("payment-reviews:resolve", async (_event, input: unknown) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid payment-review resolution.");
    const { reviewId, feedback } = input as { reviewId?: unknown; feedback?: unknown };
    if (typeof reviewId !== "string" || !reviewId || reviewId.includes("/")) throw new Error("Invalid payment review ID.");
    if (typeof feedback !== "string" || !feedback.trim() || feedback.trim().length > 2000) throw new Error("Feedback is required and must be 2,000 characters or fewer.");
    const result = await auth.callableRequest("adminResolveGetGoPaymentReview", { reviewId, feedback: feedback.trim() }) as { review: unknown };
    return result.review;
  });
}
