import { contextBridge, ipcRenderer } from "electron";
import type {
  AppSettings,
  DesktopApi,
  RepositorySnapshot,
} from "../core/models.js";

const api: DesktopApi = {
  restartApp: () => ipcRenderer.invoke("app:restart") as Promise<void>,
  getSettings: () => ipcRenderer.invoke("settings:get") as Promise<AppSettings>,
  chooseRepository: () =>
    ipcRenderer.invoke(
      "repository:choose",
    ) as Promise<RepositorySnapshot | null>,
  scanRepository: (path?: string, force?: boolean) =>
    ipcRenderer.invoke(
      "repository:scan",
      path,
      force,
    ) as Promise<RepositorySnapshot>,
  loadContentV2Topic: (topicId) =>
    ipcRenderer.invoke("content-v2:topic:load", topicId),
  loadContentV2Quiz: (topicId, quizId) =>
    ipcRenderer.invoke("content-v2:quiz:load", topicId, quizId),
  loadContentV2Question: (topicId, quizId, questionId) =>
    ipcRenderer.invoke("content-v2:question:load", topicId, quizId, questionId),
  loadContentV2QuizResources: (topicId, quizId) =>
    ipcRenderer.invoke("content-v2:quiz:resources", topicId, quizId),
  saveContentV2QuizDictionary: (topicId, quizId, dictionary) =>
    ipcRenderer.invoke("content-v2:quiz:dictionary:save", topicId, quizId, dictionary),
  loadContentV2TopicDictionary: (topicId) =>
    ipcRenderer.invoke("content-v2:topic:dictionary:load", topicId),
  saveContentV2TopicDictionary: (topicId, dictionary) =>
    ipcRenderer.invoke("content-v2:topic:dictionary:save", topicId, dictionary),
  listContentV2TopicAssets: (topicId) =>
    ipcRenderer.invoke("content-v2:topic:assets:list", topicId),
  readContentV2TopicAsset: (topicId, filename) =>
    ipcRenderer.invoke("content-v2:topic:asset:read", topicId, filename),
  importContentV2TopicAssets: (topicId) =>
    ipcRenderer.invoke("content-v2:topic:assets:import", topicId),
  trashContentV2TopicAsset: (topicId, filename) =>
    ipcRenderer.invoke("content-v2:topic:asset:trash", topicId, filename),
  showContentV2TopicAssetsFolder: (topicId) =>
    ipcRenderer.invoke("content-v2:topic:assets:show", topicId),
  saveContentV2Topic: (topic) =>
    ipcRenderer.invoke("content-v2:topic:save", topic),
  saveContentV2Quiz: (topicId, quiz) =>
    ipcRenderer.invoke("content-v2:quiz:save", topicId, quiz),
  saveContentV2Question: (topicId, quizId, question) =>
    ipcRenderer.invoke("content-v2:question:save", topicId, quizId, question),
  previewContentV2QuizPublish: (topicId, quizId) =>
    ipcRenderer.invoke("content-v2:quiz:publish-preview", topicId, quizId),
  previewContentV2TopicPublish: (topicId) =>
    ipcRenderer.invoke("content-v2:topic:publish-preview", topicId),
  markAllContentV2QuizQuestionsReviewed: (topicId, quizId) =>
    ipcRenderer.invoke("content-v2:questions:review-all", topicId, quizId),
  deleteContentV2Topic: (topicId) =>
    ipcRenderer.invoke("content-v2:topic:delete", topicId),
  deleteContentV2Quiz: (topicId, quizId) =>
    ipcRenderer.invoke("content-v2:quiz:delete", topicId, quizId),
  deleteContentV2Question: (topicId, quizId, questionId) =>
    ipcRenderer.invoke(
      "content-v2:question:delete",
      topicId,
      quizId,
      questionId,
    ),
  setEnvironment: (environment) =>
    ipcRenderer.invoke(
      "settings:environment",
      environment,
    ) as Promise<AppSettings>,
  setAiProfile: (profile) =>
    ipcRenderer.invoke("settings:ai-profile", profile) as Promise<AppSettings>,
  setLocale: (locale) =>
    ipcRenderer.invoke("settings:locale", locale) as Promise<AppSettings>,
  setSpeechSettings: (language, settings) =>
    ipcRenderer.invoke(
      "settings:speech",
      language,
      settings,
    ) as Promise<AppSettings>,
  checkEnvironmentReadiness: () => ipcRenderer.invoke("environment:readiness"),
  getPublishingStatus: () => ipcRenderer.invoke("publishing:status"),
  publishQuiz: (contestId, quizId) =>
    ipcRenderer.invoke("publishing:quiz", contestId, quizId),
  publishContentV2Topic: (topicId) =>
    ipcRenderer.invoke("content-v2:topic:publish", topicId),
  publishContentV2Quiz: (topicId, quizId) =>
    ipcRenderer.invoke("content-v2:quiz:publish", topicId, quizId),
  showInFolder: (path) =>
    ipcRenderer.invoke("shell:show", path) as Promise<void>,
  showQuizQuestionInFolder: (manifestPath, questionNo) =>
    ipcRenderer.invoke(
      "shell:show-question",
      manifestPath,
      questionNo,
    ) as Promise<void>,
  readQuizAsset: (manifestPath, assetReference) =>
    ipcRenderer.invoke(
      "quiz-asset:read",
      manifestPath,
      assetReference,
    ) as Promise<string>,
  readQuizSource: (manifestPath) =>
    ipcRenderer.invoke("quiz-source:read", manifestPath) as Promise<string>,
  saveQuizSource: (manifestPath, source) =>
    ipcRenderer.invoke(
      "quiz-source:save",
      manifestPath,
      source,
    ) as Promise<void>,
  loadQuizQuestions: (manifestPath) =>
    ipcRenderer.invoke("quiz-questions:load", manifestPath),
  loadAlphabetDictionary: (manifestPath) =>
    ipcRenderer.invoke("alphabet-dictionary:load", manifestPath),
  saveAlphabetDictionary: (manifestPath, dictionary) =>
    ipcRenderer.invoke("alphabet-dictionary:save", manifestPath, dictionary),
  migrateLegacyQuizzes: (contestId) =>
    ipcRenderer.invoke("quiz-questions:migrate-legacy", contestId),
  saveQuizQuestion: (manifestPath, question) =>
    ipcRenderer.invoke("quiz-questions:save", manifestPath, question),
  markAllQuizQuestionsReviewed: (manifestPath) =>
    ipcRenderer.invoke("quiz-questions:review-all", manifestPath),
  createQuizQuestion: (manifestPath) =>
    ipcRenderer.invoke("quiz-questions:create", manifestPath),
  reorderQuizQuestions: (manifestPath, questionNumbers) =>
    ipcRenderer.invoke("quiz-questions:reorder", manifestPath, questionNumbers),
  deleteQuizQuestion: (manifestPath, questionNo) =>
    ipcRenderer.invoke("quiz-questions:delete", manifestPath, questionNo),
  resetQuizQuestion: (manifestPath, question) =>
    ipcRenderer.invoke("quiz-questions:reset", manifestPath, question),
  openExternal: (url) =>
    ipcRenderer.invoke("shell:open-external", url) as Promise<void>,
  copyText: (text) =>
    ipcRenderer.invoke("clipboard:write", text) as Promise<void>,
  resolveYouTubeResources: (urls) =>
    ipcRenderer.invoke("resources:youtube:resolve", urls),
  createContest: (settings) =>
    ipcRenderer.invoke(
      "crud:contest:create",
      settings,
    ) as Promise<RepositorySnapshot>,
  updateContest: (id, settings) =>
    ipcRenderer.invoke(
      "crud:contest:update",
      id,
      settings,
    ) as Promise<RepositorySnapshot>,
  renameContest: (currentId, nextId) =>
    ipcRenderer.invoke(
      "crud:contest:rename",
      currentId,
      nextId,
    ) as Promise<RepositorySnapshot>,
  deleteContest: (id) =>
    ipcRenderer.invoke(
      "crud:contest:delete",
      id,
    ) as Promise<RepositorySnapshot>,
  createQuiz: (contest, input) =>
    ipcRenderer.invoke(
      "crud:quiz:create",
      contest,
      input,
    ) as Promise<RepositorySnapshot>,
  updateQuiz: (manifestPath, input) =>
    ipcRenderer.invoke(
      "crud:quiz:update",
      manifestPath,
      input,
    ) as Promise<RepositorySnapshot>,
  deleteQuiz: (manifestPath) =>
    ipcRenderer.invoke(
      "crud:quiz:delete",
      manifestPath,
    ) as Promise<RepositorySnapshot>,
  getAuthState: () => ipcRenderer.invoke("auth:state"),
  signIn: (email, password) =>
    ipcRenderer.invoke("auth:sign-in", email, password),
  signInWithProvider: (provider) =>
    ipcRenderer.invoke("auth:provider", provider),
  signOut: () => ipcRenderer.invoke("auth:sign-out"),
  changePassword: (password) =>
    ipcRenderer.invoke("auth:change-password", password),
  createDynamicQuestionProposal: (input) =>
    ipcRenderer.invoke("ai:dynamic-question", input),
  fixDynamicQuestion: (input) =>
    ipcRenderer.invoke("ai:fix-dynamic-question", input),
  cancelDynamicQuestionAi: () =>
    ipcRenderer.invoke("ai:cancel-dynamic-question"),
  startAiMigrationJob: (input) =>
    ipcRenderer.invoke("ai-migration:start", input),
  getAiMigrationJobs: () => ipcRenderer.invoke("ai-migration:list"),
  getBackgroundJobs: () => ipcRenderer.invoke("jobs:list"),
  startDeployment: (operation, component, target) =>
    ipcRenderer.invoke("deployment:start", operation, component, target),
  getDeploymentState: (target) => ipcRenderer.invoke("deployment:state", target),
  getLocalWebRuntime: () => ipcRenderer.invoke("local-web:state"),
  startLocalWebRuntime: () => ipcRenderer.invoke("local-web:start"),
  restartLocalWebRuntime: () => ipcRenderer.invoke("local-web:restart"),
  cancelBackgroundJob: (jobId) => ipcRenderer.invoke("jobs:cancel", jobId),
  pauseBackgroundJob: (jobId) => ipcRenderer.invoke("jobs:pause", jobId),
  resumeBackgroundJob: (jobId) => ipcRenderer.invoke("jobs:resume", jobId),
  retryBackgroundJob: (jobId) => ipcRenderer.invoke("jobs:retry", jobId),
  deleteBackgroundJob: (jobId) => ipcRenderer.invoke("jobs:delete", jobId),
  setAiMigrationConcurrency: (concurrency) =>
    ipcRenderer.invoke("ai-migration:concurrency", concurrency),
  cancelAiMigrationJob: (jobId) =>
    ipcRenderer.invoke("ai-migration:cancel", jobId),
};

contextBridge.exposeInMainWorld("getgo", api);
