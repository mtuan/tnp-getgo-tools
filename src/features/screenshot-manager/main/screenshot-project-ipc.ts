import { session, shell, webContents, type IpcMain } from "electron";
import path from "node:path";
import type {
  ScreenshotMetadataInput,
  ScreenshotProjectInput,
  PageBreakdownInput,
  CapturedDomSnapshot,
} from "../domain/screenshot-project.js";
import { ScreenshotProjectService } from "./screenshot-project-service.js";
import { findRelatedRepository } from "../../../shared/main/repository-locator.js";

export function registerScreenshotProjectIpc(
  ipcMain: IpcMain,
  toolsAppPath: string,
): void {
  const service = async () => {
    const webRepositoryRoot = await findRelatedRepository(toolsAppPath, {
      packageName: "tnp-getgo-web",
      directoryName: "tnp-getgo-web",
      environmentVariable: "GETGO_WEB_ROOT",
    });
    if (!webRepositoryRoot)
      throw new Error("GetGo Web repository was not found. Set GETGO_WEB_ROOT to its absolute path.");
    return new ScreenshotProjectService(path.join(
      webRepositoryRoot,
      "docs",
      "screenshots",
      "projects",
    ));
  };
  ipcMain.handle("screenshots:projects:list", async () => (await service()).list());
  ipcMain.handle(
    "screenshots:projects:create",
    async (_event, input: ScreenshotProjectInput) => (await service()).create(input),
  );
  ipcMain.handle(
    "screenshots:projects:update",
    async (_event, projectId: string, input: ScreenshotProjectInput) => (await service()).updateProject(projectId, input),
  );
  ipcMain.handle("screenshots:projects:load", async (_event, projectId: string) =>
    (await service()).load(projectId),
  );
  ipcMain.handle("screenshots:analysis:load", async (_event, projectId: string) =>
    (await service()).loadAnalysis(projectId),
  );
  ipcMain.handle("screenshots:clipboard:inspect", async () =>
    (await service()).inspectClipboard(),
  );
  ipcMain.handle(
    "screenshots:add",
    async (_event, projectId: string, imageDataUrl: string, metadata: ScreenshotMetadataInput, domSnapshot?: CapturedDomSnapshot) =>
      (await service()).add(projectId, imageDataUrl, metadata, domSnapshot),
  );
  ipcMain.handle(
    "screenshots:update",
    async (
      _event,
      projectId: string,
      screenshotId: string,
      metadata: ScreenshotMetadataInput,
    ) => (await service()).update(projectId, screenshotId, metadata),
  );
  ipcMain.handle(
    "screenshots:delete",
    async (_event, projectId: string, screenshotId: string) => (await service()).delete(projectId, screenshotId),
  );
  ipcMain.handle(
    "screenshots:page:delete",
    async (_event, projectId: string, route: string) => (await service()).deletePage(projectId, route),
  );
  ipcMain.handle("screenshots:clear", async (_event, projectId: string) =>
    (await service()).clear(projectId),
  );
  ipcMain.handle("screenshots:clear-all-data", async (_event, projectId: string) =>
    (await service()).clearAllData(projectId),
  );
  ipcMain.handle("screenshots:breakdown:update", async (_event, projectId: string, input: PageBreakdownInput) =>
    (await service()).updatePageBreakdown(projectId, input),
  );
  ipcMain.handle("screenshots:preview:clear-data", async () => {
    const previewSession = session.fromPartition("persist:getgo-device-preview");
    const previewContents = webContents
      .getAllWebContents()
      .filter((contents) => !contents.isDestroyed() && contents.session === previewSession);
    await Promise.allSettled(previewContents.map((contents) =>
      contents.executeJavaScript("localStorage.clear(); sessionStorage.clear();"),
    ));
    await Promise.all([
      previewSession.clearStorageData(),
      previewSession.clearCache(),
    ]);
    previewSession.flushStorageData();
  });
  ipcMain.handle(
    "screenshots:projects:show",
    async (_event, projectId: string) => {
      await shell.openPath((await service()).folder(projectId));
    },
  );
}
