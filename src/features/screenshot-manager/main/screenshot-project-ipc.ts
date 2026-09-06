import { shell, type IpcMain } from "electron";
import type {
  ScreenshotMetadataInput,
  ScreenshotProjectInput,
} from "../domain/screenshot-project.js";
import { ScreenshotProjectService } from "./screenshot-project-service.js";

export function registerScreenshotProjectIpc(
  ipcMain: IpcMain,
  userDataPath: string,
): void {
  const service = new ScreenshotProjectService(userDataPath);
  ipcMain.handle("screenshots:projects:list", () => service.list());
  ipcMain.handle(
    "screenshots:projects:create",
    (_event, input: ScreenshotProjectInput) => service.create(input),
  );
  ipcMain.handle(
    "screenshots:projects:update",
    (_event, projectId: string, input: ScreenshotProjectInput) => service.updateProject(projectId, input),
  );
  ipcMain.handle("screenshots:projects:load", (_event, projectId: string) =>
    service.load(projectId),
  );
  ipcMain.handle("screenshots:clipboard:inspect", () => service.inspectClipboard());
  ipcMain.handle(
    "screenshots:add",
    (_event, projectId: string, imageDataUrl: string, metadata: ScreenshotMetadataInput) =>
      service.add(projectId, imageDataUrl, metadata),
  );
  ipcMain.handle(
    "screenshots:update",
    (
      _event,
      projectId: string,
      screenshotId: string,
      metadata: ScreenshotMetadataInput,
    ) => service.update(projectId, screenshotId, metadata),
  );
  ipcMain.handle(
    "screenshots:delete",
    (_event, projectId: string, screenshotId: string) => service.delete(projectId, screenshotId),
  );
  ipcMain.handle(
    "screenshots:projects:show",
    async (_event, projectId: string) => {
      await shell.openPath(service.folder(projectId));
    },
  );
}
