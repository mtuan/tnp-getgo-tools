import { app, dialog, type IpcMain } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { detectImageOrientations, imagePdfExtensions, isImagePdfPath, loadImagePdfSelection } from "./image-pdf-service.js";

export function registerImagePdfIpc(ipcMain: IpcMain) {
  ipcMain.handle("utility:pdf:browse", async (_event, mode: unknown) => {
    if (mode !== "files" && mode !== "folder") throw new Error("Invalid image browse mode.");
    const selection = await dialog.showOpenDialog({
      title: mode === "folder" ? "Choose image folder" : "Choose images",
      properties: mode === "folder" ? ["openDirectory"] : ["openFile", "multiSelections"],
      filters: mode === "files" ? [{ name: "Images", extensions: imagePdfExtensions }] : undefined,
    });
    return selection.canceled || !selection.filePaths.length ? null : loadImagePdfSelection(selection.filePaths);
  });
  ipcMain.handle("utility:pdf:load-inputs", (_event, inputPaths: unknown) => {
    if (!Array.isArray(inputPaths) || inputPaths.some((value) => typeof value !== "string")) throw new Error("Invalid dropped paths.");
    return loadImagePdfSelection(inputPaths);
  });
  ipcMain.handle("utility:pdf:detect-orientations", async (_event, inputPaths: unknown) => {
    if (!Array.isArray(inputPaths) || !inputPaths.length || inputPaths.some((value) => typeof value !== "string" || !path.isAbsolute(value)))
      throw new Error("Select valid images before detecting text orientation.");
    const paths = inputPaths as string[];
    for (const filePath of paths) if (!isImagePdfPath(filePath)) throw new Error(`Unsupported image: ${path.basename(filePath)}`);
    return detectImageOrientations(paths);
  });
  ipcMain.handle("utility:pdf:save", async (_event, data: unknown, suggestedName: unknown, defaultDirectory: unknown) => {
    if (!(data instanceof ArrayBuffer)) throw new Error("Generated PDF data is invalid.");
    if (data.byteLength < 5 || data.byteLength > 250 * 1024 * 1024) throw new Error("Generated PDF size is invalid.");
    const safeName = typeof suggestedName === "string" ? path.basename(suggestedName).replace(/[^a-zA-Z0-9._-]/g, "-") : "images.pdf";
    const filename = safeName.toLowerCase().endsWith(".pdf") ? safeName : `${safeName}.pdf`;
    let outputDirectory = app.getPath("documents");
    if (typeof defaultDirectory === "string" && path.isAbsolute(defaultDirectory))
      try { if ((await fs.stat(defaultDirectory)).isDirectory()) outputDirectory = defaultDirectory; } catch { /* use Documents */ }
    const selection = await dialog.showSaveDialog({ title: "Save image PDF", defaultPath: path.join(outputDirectory, filename), filters: [{ name: "PDF document", extensions: ["pdf"] }] });
    if (selection.canceled || !selection.filePath) return null;
    await fs.writeFile(selection.filePath, Buffer.from(data));
    return { filePath: selection.filePath };
  });
}
