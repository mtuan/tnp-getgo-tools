import path from "node:path";
import { promises as fs } from "node:fs";
import { shell, type IpcMain } from "electron";
import type { RepositorySnapshot } from "../../../shared/domain/models.js";
import { hashContentV2, sanitizeContentV2Question, sanitizeContentV2Topic, sanitizeMarketplaceTopic } from "../domain/content-v2.js";
import { calculateContentV2QuizHash, loadContentV2Question, loadContentV2Quiz, loadContentV2Topic, saveContentV2Question, saveContentV2Quiz, saveContentV2Topic } from "../repository/content-v2-repository.js";
import { parseMarketplaceTopicState } from "./marketplace-sync.js";
import { setContentV2MarketplaceState } from "./content-v2-marketplace-batch.js";

interface SnapshotState { value: RepositorySnapshot | null }
interface Dependencies { snapshotState: SnapshotState; requireSnapshot(): RepositorySnapshot; repositoryRoot(): Promise<string> }
export function registerContentV2CrudIpc(ipcMain: IpcMain, { snapshotState, requireSnapshot, repositoryRoot }: Dependencies): void {
ipcMain.handle("content-v2:topic:save", async (_event, value: unknown) => {
  const root = await repositoryRoot();
  const saved = await saveContentV2Topic(root, value);
  const current = requireSnapshot();
  const existing = current.contentV2.topics.find(
    (item) => item.id === saved.id,
  );
  const topicQuizzes = current.contentV2.quizzes.filter(
    (item) => item.topicId === saved.id,
  );
  const summary = {
    ...(existing ?? {}),
    id: saved.id,
    type: saved.type,
    title: saved.title,
    description: saved.description,
    status: saved.status,
    order: saved.order,
    filePath:
      existing?.filePath ??
      path.join(root, "content-v2", "topics", saved.id, "topic.json"),
    localHash: hashContentV2({
      topic: sanitizeContentV2Topic(saved),
      quizzes: topicQuizzes.map(({ id, type, order }) => ({
        id,
        type,
        order,
      })),
    }),
    publishedHash: saved.publishedHash ?? null,
    publishedAt: saved.publishedAt ?? null,
    quizCount: topicQuizzes.length,
    marketplace: saved.marketplace,
    marketplaceLocalHash: hashContentV2(sanitizeMarketplaceTopic(saved)),
    marketplacePublishedHash:
      typeof saved.marketplace?.publishedHash === "string"
        ? saved.marketplace.publishedHash
        : null,
    marketplacePublishedAt:
      typeof saved.marketplace?.publishedAt === "string"
        ? saved.marketplace.publishedAt
        : null,
    ...(saved.type === "competition"
      ? {
          subject: saved.subject,
          rounds: saved.rounds,
          gradeGroups: saved.gradeGroups,
        }
      : {
          supportedLanguages: saved.supportedLanguages,
          recommendedAgeRange: saved.recommendedAgeRange,
        }),
  };
  snapshotState.value = {
    ...current,
    contentV2: {
      ...current.contentV2,
      topics: existing
        ? current.contentV2.topics.map((item) =>
            item.id === saved.id ? summary : item,
          )
        : [...current.contentV2.topics, summary],
    },
  };
return requireSnapshot();
});
ipcMain.handle(
  "content-v2:marketplace-state:set",
  async (
    _event,
    target: unknown,
    ids: unknown,
    stateValue: unknown,
    topicIdValue: unknown,
  ) => {
    if (target !== "topics" && target !== "quizzes")
      throw new Error("Invalid marketplace batch target.");
    if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string"))
      throw new Error("Invalid marketplace batch IDs.");
    const state = parseMarketplaceTopicState(stateValue);
    const root = await repositoryRoot();
    return setContentV2MarketplaceState({
      root,
      target,
      ids,
      state,
      ...(typeof topicIdValue === "string" ? { topicId: topicIdValue } : {}),
    });
  },
);
ipcMain.handle(
  "content-v2:quiz:save",
  async (_event, topicId: unknown, value: unknown) => {
    if (typeof topicId !== "string") throw new Error("Invalid topic ID.");
    const root = await repositoryRoot();
    const topic = await loadContentV2Topic(root, topicId);
    const saved = await saveContentV2Quiz(root, topic, value);
    const current = requireSnapshot();
    snapshotState.value = {
      ...current,
      contentV2: {
        ...current.contentV2,
        quizzes: current.contentV2.quizzes.map((summary) =>
          summary.topicId === topicId && summary.id === saved.id
            ? {
                ...summary,
                title: saved.title,
                icon: saved.icon,
                description: saved.description,
                status: saved.status,
                order: saved.order,
                publishedHash: saved.publishedHash ?? null,
                publishedAt: saved.publishedAt ?? null,
                marketplace: saved.marketplace,
                ...(saved.type === "competition-paper"
                  ? { grade: saved.grade, round: saved.round, year: saved.year }
                  : { language: saved.language }),
              }
            : summary,
        ),
      },
    };
return requireSnapshot();
  },
);
ipcMain.handle(
  "content-v2:question:save",
  async (_event, topicId: unknown, quizId: unknown, value: unknown) => {
    if (typeof topicId !== "string" || typeof quizId !== "string")
      throw new Error("Invalid question selection.");
    const root = await repositoryRoot();
    const [topic, quiz] = await Promise.all([
      loadContentV2Topic(root, topicId),
      loadContentV2Quiz(root, topicId, quizId),
    ]);
    const saved = await saveContentV2Question(root, topic, quiz, value);
    const current = requireSnapshot();
    const key = `${topicId}/${quizId}/${saved.id}`;
    const existing = current.contentV2.questions.find(
      (item) => item.key === key,
    );
    const localHash = hashContentV2(sanitizeContentV2Question(saved));
    const questionSummary = {
      key,
      topicId,
      quizId,
      id: saved.id,
      type: saved.type,
      order: saved.order,
      status: saved.status,
      filePath:
        existing?.filePath ??
        path.join(
          root,
          "content-v2",
          "topics",
          topicId,
          "quizzes",
          quizId,
          "questions",
          `${saved.id}.json`,
        ),
      localHash,
      label:
        saved.type === "alphabet-letter"
          ? `${saved.uppercase} ${saved.lowercase}`
          : Array.isArray(saved.text.en)
            ? saved.text.en.join(" ")
            : saved.text.en,
      ...(saved.type === "competition-question"
        ? {
            category: saved.category,
            hasImages: saved.assets.length > 0,
            dynamic: Boolean(saved.dynamic),
          }
        : {}),
    };
    const questions = existing
      ? current.contentV2.questions.map((item) =>
          item.key === key ? questionSummary : item,
        )
      : [...current.contentV2.questions, questionSummary];
    const quizQuestions = questions.filter(
      (item) => item.topicId === topicId && item.quizId === quizId,
    );
    const quizLocalHash = await calculateContentV2QuizHash(
      root,
      topicId,
      quizId,
    );
    snapshotState.value = {
      ...current,
      contentV2: {
        ...current.contentV2,
        questions,
        quizzes: current.contentV2.quizzes.map((item) =>
          item.topicId === topicId && item.id === quizId
            ? {
                ...item,
                localHash: quizLocalHash,
                questionCount: quizQuestions.length,
                reviewedQuestionCount: quizQuestions.filter(
                  (question) => question.status === "reviewed",
                ).length,
              }
            : item,
        ),
      },
    };
return requireSnapshot();
  },
);
ipcMain.handle(
  "content-v2:questions:review-all",
  async (_event, topicId: unknown, quizId: unknown) => {
    if (typeof topicId !== "string" || typeof quizId !== "string")
      throw new Error("Invalid question selection.");
    const root = await repositoryRoot();
    const current = requireSnapshot();
    const summaries = current.contentV2.questions.filter(
      (item) => item.topicId === topicId && item.quizId === quizId,
    );
    const [topic, quiz] = await Promise.all([
      loadContentV2Topic(root, topicId),
      loadContentV2Quiz(root, topicId, quizId),
    ]);
    await Promise.all(
      summaries
        .filter((item) => item.status !== "reviewed")
        .map(async (item) => {
          const question = await loadContentV2Question(
            root,
            topicId,
            quizId,
            item.id,
          );
          await saveContentV2Question(root, topic, quiz, {
            ...question,
            status: "reviewed",
          });
        }),
    );
    snapshotState.value = {
      ...current,
      contentV2: {
        ...current.contentV2,
        questions: current.contentV2.questions.map((item) =>
          item.topicId === topicId && item.quizId === quizId
            ? { ...item, status: "reviewed" }
            : item,
        ),
        quizzes: current.contentV2.quizzes.map((item) =>
          item.topicId === topicId && item.id === quizId
            ? { ...item, reviewedQuestionCount: summaries.length }
            : item,
        ),
      },
    };
    return requireSnapshot();
  },
);
ipcMain.handle(
  "content-v2:topic:delete",
  async (_event, topicId: unknown) => {
    if (typeof topicId !== "string" || !/^[a-z][a-z0-9-]*$/.test(topicId))
      throw new Error("Invalid topic ID.");
    const root = await repositoryRoot();
    const directory = path.join(root, "content-v2", "topics", topicId);
    await fs.access(path.join(directory, "topic.json"));
    await shell.trashItem(directory);
    const current = requireSnapshot();
    snapshotState.value = {
      ...current,
      contentV2: {
        ...current.contentV2,
        topics: current.contentV2.topics.filter(
          (item) => item.id !== topicId,
        ),
        quizzes: current.contentV2.quizzes.filter(
          (item) => item.topicId !== topicId,
        ),
        questions: current.contentV2.questions.filter(
          (item) => item.topicId !== topicId,
        ),
      },
    };
return requireSnapshot();
  },
);
ipcMain.handle(
  "content-v2:quiz:delete",
  async (_event, topicId: unknown, quizId: unknown) => {
    if (
      typeof topicId !== "string" ||
      typeof quizId !== "string" ||
      !/^[a-z][a-z0-9-]*$/.test(topicId) ||
      !/^[a-z][a-z0-9-]*$/.test(quizId)
    )
      throw new Error("Invalid quiz selection.");
    const root = await repositoryRoot();
    const directory = path.join(
      root,
      "content-v2",
      "topics",
      topicId,
      "quizzes",
      quizId,
    );
    await fs.access(path.join(directory, "quiz.json"));
    await shell.trashItem(directory);
    const current = requireSnapshot();
    const quizzes = current.contentV2.quizzes.filter(
      (item) => !(item.topicId === topicId && item.id === quizId),
    );
    const topic = await loadContentV2Topic(root, topicId);
    const topicQuizzes = quizzes.filter((item) => item.topicId === topicId);
    snapshotState.value = {
      ...current,
      contentV2: {
        ...current.contentV2,
        quizzes,
        questions: current.contentV2.questions.filter(
          (item) => !(item.topicId === topicId && item.quizId === quizId),
        ),
        topics: current.contentV2.topics.map((item) =>
          item.id === topicId
            ? {
                ...item,
                quizCount: topicQuizzes.length,
                localHash: hashContentV2({
                  topic: sanitizeContentV2Topic(topic),
                  quizzes: topicQuizzes.map(({ id, type, order }) => ({
                    id,
                    type,
                    order,
                  })),
                }),
              }
            : item,
        ),
      },
    };
return requireSnapshot();
  },
);
ipcMain.handle(
  "content-v2:question:delete",
  async (_event, topicId: unknown, quizId: unknown, questionId: unknown) => {
    const ids = [topicId, quizId, questionId];
    if (
      ids.some(
        (value) =>
          typeof value !== "string" || !/^[a-z][a-z0-9-]*$/.test(value),
      )
    )
      throw new Error("Invalid question selection.");
    const root = await repositoryRoot();
    const filePath = path.join(
      root,
      "content-v2",
      "topics",
      topicId as string,
      "quizzes",
      quizId as string,
      "questions",
      `${questionId}.json`,
    );
    await fs.access(filePath);
    await shell.trashItem(filePath);
    const current = requireSnapshot();
    const typedTopicId = topicId as string;
    const typedQuizId = quizId as string;
    const typedQuestionId = questionId as string;
    const localHash = await calculateContentV2QuizHash(
      root,
      typedTopicId,
      typedQuizId,
    );
    const questions = current.contentV2.questions.filter(
      (item) =>
        !(
          item.topicId === typedTopicId &&
          item.quizId === typedQuizId &&
          item.id === typedQuestionId
        ),
    );
    const quizQuestions = questions.filter(
      (item) => item.topicId === typedTopicId && item.quizId === typedQuizId,
    );
    snapshotState.value = {
      ...current,
      contentV2: {
        ...current.contentV2,
        questions,
        quizzes: current.contentV2.quizzes.map((item) =>
          item.topicId === typedTopicId && item.id === typedQuizId
            ? {
                ...item,
                localHash,
                questionCount: quizQuestions.length,
                reviewedQuestionCount: quizQuestions.filter(
                  (question) => question.status === "reviewed",
                ).length,
              }
            : item,
        ),
      },
    };
return requireSnapshot();
  },
);

}
