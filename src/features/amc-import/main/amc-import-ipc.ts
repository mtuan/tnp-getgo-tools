import type { IpcMain } from "electron";
import type { AmcContestName, AmcImportPreview } from "../domain/amc-import.js";
import { discoverAmcArchive, previewAmcPaper } from "./amc-browser.js";
import { importAmcPreview } from "./amc-import-repository.js";
import { AmcImportService } from "./amc-import-service.js";
import { AmcImportJobManager } from "./amc-import-jobs.js";

interface Dependencies { repositoryRoot(): Promise<string>; userDataPath: string }

function validatePreview(value: unknown): AmcImportPreview {
  const preview = value as AmcImportPreview;
  if (!preview || typeof preview !== "object" || typeof preview.quiz?.contest !== "string" || !preview.quiz.contest.trim() || !Number.isInteger(preview.quiz?.year))
    throw new Error("Invalid AMC import preview.");
  if (!/^[a-z][a-z0-9_-]*$/.test(preview.topic?.id) || !/^[a-z0-9][a-z0-9_-]*$/.test(preview.quiz?.id) || !Array.isArray(preview.questions))
    throw new Error("Invalid AMC import content.");
  if (!preview.questions.every((question) => /^q[1-9][0-9]*$/.test(question.id) && question.number > 0 && typeof question.text === "string" && Array.isArray(question.solutions)))
    throw new Error("Invalid AMC questions.");
  return preview;
}

export function registerAmcImportIpc(ipcMain: IpcMain, { repositoryRoot, userDataPath }: Dependencies): AmcImportJobManager {
  const service = new AmcImportService(repositoryRoot, userDataPath);
  const jobs = new AmcImportJobManager(userDataPath, service);
  ipcMain.handle("amc-import:archive:discover", () => discoverAmcArchive());
  ipcMain.handle("amc-import:paper:preview", (_event, contest: unknown, year: unknown) => {
    if (typeof contest !== "string" || !contest.trim() || contest.length > 80) throw new Error("Invalid AMC contest.");
    if (!Number.isInteger(year) || Number(year) < 1950 || Number(year) > 2100) throw new Error("Enter a valid AMC year.");
    return previewAmcPaper(contest as AmcContestName, Number(year));
  });
  ipcMain.handle("amc-import:paper:import", async (_event, value: unknown, overwriteValue: unknown) => {
    const preview = validatePreview(value);
    return importAmcPreview(await repositoryRoot(), preview, overwriteValue === true);
  });
  ipcMain.handle("amc-import:dashboard:load", (_event, refresh: unknown) => service.dashboard(refresh === true));
  ipcMain.handle("amc-import:run", async (_event, input: unknown) => {
    const value = input as import("../domain/amc-import.js").StartAmcImportInput;
    if (!value || !["quiz", "topic", "all"].includes(value.scope)) throw new Error("Invalid AMC import scope.");
    await jobs.start(value);
    return service.dashboard(false);
  });
  return jobs;
}
