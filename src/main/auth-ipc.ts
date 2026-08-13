import type { IpcMain } from "electron";
import type { FirebaseAuthService } from "./firebase-auth.js";

export function registerAuthIpc(ipcMain: IpcMain, auth: FirebaseAuthService) {
  ipcMain.handle("auth:state", () => auth.state());
  ipcMain.handle("environment:readiness", () => auth.checkReadiness());
  ipcMain.handle("auth:sign-in", (_event, email: unknown, password: unknown) => {
    if (typeof email !== "string" || typeof password !== "string" || !email.includes("@") || password.length < 1)
      throw new Error("Enter a valid email and password.");
    return auth.signIn(email.trim(), password);
  });
  ipcMain.handle("auth:sign-out", () => auth.signOut());
  ipcMain.handle("auth:change-password", (_event, password: unknown) => {
    if (typeof password !== "string" || password.length < 8 || password.length > 256)
      throw new Error("Password must contain at least 8 characters.");
    return auth.changePassword(password);
  });
  ipcMain.handle("auth:provider", (_event, provider: unknown) => {
    if (!(provider === "google" || provider === "facebook" || provider === "apple")) throw new Error("Unsupported sign-in provider.");
    return auth.signInWithProvider(provider);
  });
}
