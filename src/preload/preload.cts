import { contextBridge, ipcRenderer } from "electron"
import type { AppSettings, DesktopApi, RepositorySnapshot } from "../core/models.js"

const api: DesktopApi = {
  getSettings: () => ipcRenderer.invoke("settings:get") as Promise<AppSettings>,
  chooseRepository: () => ipcRenderer.invoke("repository:choose") as Promise<RepositorySnapshot | null>,
  scanRepository: (path?: string) => ipcRenderer.invoke("repository:scan", path) as Promise<RepositorySnapshot>,
  setEnvironment: (environment) => ipcRenderer.invoke("settings:environment", environment) as Promise<AppSettings>,
  showInFolder: (path) => ipcRenderer.invoke("shell:show", path) as Promise<void>,
  readQuizSource: (manifestPath) => ipcRenderer.invoke("quiz-source:read", manifestPath) as Promise<string>,
  saveQuizSource: (manifestPath, source) => ipcRenderer.invoke("quiz-source:save", manifestPath, source) as Promise<void>,
  openExternal: (url) => ipcRenderer.invoke("shell:open-external", url) as Promise<void>,
  createContest: (settings) => ipcRenderer.invoke("crud:contest:create", settings) as Promise<RepositorySnapshot>,
  updateContest: (id, settings) => ipcRenderer.invoke("crud:contest:update", id, settings) as Promise<RepositorySnapshot>,
  renameContest: (currentId, nextId) => ipcRenderer.invoke("crud:contest:rename", currentId, nextId) as Promise<RepositorySnapshot>,
  deleteContest: (id) => ipcRenderer.invoke("crud:contest:delete", id) as Promise<RepositorySnapshot>,
  createQuiz: (contest, input) => ipcRenderer.invoke("crud:quiz:create", contest, input) as Promise<RepositorySnapshot>,
  updateQuiz: (manifestPath, input) => ipcRenderer.invoke("crud:quiz:update", manifestPath, input) as Promise<RepositorySnapshot>,
  deleteQuiz: (manifestPath) => ipcRenderer.invoke("crud:quiz:delete", manifestPath) as Promise<RepositorySnapshot>,
}

contextBridge.exposeInMainWorld("getgo", api)
