import type { IpcMain } from "electron";
import type { RepositorySnapshot } from "../../../shared/domain/models.js";
import { hashContentV2, marketplaceTopicState, sanitizeMarketplaceTopic, withMarketplaceTopicState } from "../domain/content-v2.js";
import { reviewedTopicQuizzes, shouldPublishContainingTopic } from "../domain/content-v2-publish-policy.js";
import { createContentV2QuizPublishPreview, createContentV2TopicPublishPreview, type FirestorePublishingService } from "./firestore-publishing.js";
import { loadContentV2Assets, loadContentV2Question, loadContentV2Quiz, loadContentV2QuizResources, loadContentV2Topic, readContentV2QuizPublishState, recordContentV2Published, saveContentV2Topic, writeContentV2QuizPublishState } from "../repository/content-v2-repository.js";
import { syncMarketplaceTopic, syncedMarketplaceMetadata } from "./marketplace-sync.js";
import type { PublishJobManager } from "../../jobs/main/publish-jobs.js";
import type { FirebaseAuthService } from "../../authentication/main/firebase-auth.js";

interface SnapshotState { value: RepositorySnapshot | null }
interface Dependencies { snapshotState: SnapshotState; requireSnapshot(): RepositorySnapshot; repositoryRoot(): Promise<string>; publishing: FirestorePublishingService; publishJobs: PublishJobManager; firebaseAuth: FirebaseAuthService }
export function registerContentV2PublishingIpc(ipcMain: IpcMain, { snapshotState, requireSnapshot, repositoryRoot, publishing, publishJobs, firebaseAuth }: Dependencies): void {
ipcMain.handle(
  "content-v2:topic:publish-preview",
  async (_event, topicId: unknown) => {
    if (typeof topicId !== "string") throw new Error("Invalid topic ID.");
    const root = await repositoryRoot();
    const snapshot = requireSnapshot();
    const summary = snapshot.contentV2.topics.find(
      (item) => item.id === topicId,
    );
    if (!summary) throw new Error("The selected topic was not found.");
    const topic = await loadContentV2Topic(root, topicId);
    const quizIds = reviewedTopicQuizzes(
      snapshot.contentV2.quizzes,
      topicId,
    ).map((quiz) => quiz.id);
    return createContentV2TopicPublishPreview(
      topic,
      summary.localHash,
      quizIds,
    );
  },
);
ipcMain.handle(
  "content-v2:topic:publish",
  async (_event, topicId: unknown) => {
    if (typeof topicId !== "string") throw new Error("Invalid topic ID.");
    const root = await repositoryRoot();
    const snapshot = requireSnapshot();
    const summary = snapshot.contentV2.topics.find(
      (item) => item.id === topicId,
    );
    if (!summary) throw new Error("The selected topic was not found.");
    const topic = await loadContentV2Topic(root, topicId);
    const reviewedQuizzes = reviewedTopicQuizzes(
      snapshot.contentV2.quizzes,
      topicId,
    ).filter((quiz) => marketplaceTopicState(quiz.marketplace) !== "removed");
    for (const quiz of reviewedQuizzes)
      if (quiz.questionCount !== quiz.reviewedQuestionCount)
        throw new Error(
          `Quiz "${quiz.title}" is marked reviewed but still contains unreviewed questions.`,
        );
    return publishJobs.track(
      {
        name: `Publish to market · ${summary.title}`,
        description: `Synchronize marketplace metadata, topic, ${reviewedQuizzes.length} reviewed quizzes, questions, and assets`,
        route: `/topics/${encodeURIComponent(topicId)}?tab=marketplace`,
      },
      async (control) => {
        if (!firebaseAuth) throw new Error("Publishing is not initialized.");
        const target = await firebaseAuth.publishingTarget();
        const localQuizIds = snapshot.contentV2.quizzes.filter(
            (quiz) => quiz.topicId === topicId && marketplaceTopicState(quiz.marketplace) !== "removed",
          )
          .map((quiz) => quiz.id);
        const staleQuizIds = await publishing.staleContentV2TopicQuizIds(
          topicId,
          localQuizIds,
        );
        await control.setTotal(
          reviewedQuizzes.length + staleQuizIds.length + 2,
          `Publishing ${reviewedQuizzes.length} reviewed quizzes · removing ${staleQuizIds.length} deleted quizzes`,
        );
        const publishedQuizResults: Array<{
          key: string;
          contentHash: string;
          publishedAt: string;
        }> = [];
        for (const [index, quizSummary] of reviewedQuizzes.entries()) {
          await control.checkpoint();
          const quiz = await loadContentV2Quiz(root, topicId, quizSummary.id);
          const questionIds = snapshot.contentV2.questions
            .filter(
              (question) =>
                question.topicId === topicId &&
                question.quizId === quizSummary.id,
            )
            .sort((left, right) => left.order - right.order)
            .map((question) => question.id);
          const [questions, resources] = await Promise.all([
            Promise.all(
              questionIds.map((questionId) =>
                loadContentV2Question(
                  root,
                  topicId,
                  quizSummary.id,
                  questionId,
                ),
              ),
            ),
            loadContentV2QuizResources(root, topicId, quiz),
          ]);
          const assets = await loadContentV2Assets(
            root,
            topicId,
            quizSummary.id,
            { topic, quiz, questions, resources },
          );
          const publishState = await readContentV2QuizPublishState(
            quizSummary.filePath,
          );
          const quizResult = await publishing.publishContentV2Quiz(
            topicId,
            quiz,
            questions,
            resources,
            assets,
            quizSummary.localHash,
            publishState.targets[target.projectId],
          );
          await recordContentV2Published(
            quizSummary.filePath,
            quizResult.contentHash,
            quizResult.publishedAt,
          );
          await writeContentV2QuizPublishState(quizSummary.filePath, {
            schemaVersion: 1,
            targets: {
              ...publishState.targets,
              [quizResult.projectId]: {
                environment: quizResult.environment,
                projectId: quizResult.projectId,
                contentHash: quizResult.contentHash,
                publishedAt: quizResult.publishedAt,
                items: quizResult.items,
              },
            },
          });
          publishedQuizResults.push({
            key: quizSummary.key,
            contentHash: quizResult.contentHash,
            publishedAt: quizResult.publishedAt,
          });
          await control.advance(
            `Published reviewed quiz ${index + 1}/${reviewedQuizzes.length}`,
          );
        }
        await publishing.deleteContentV2TopicQuizzes(
          topicId,
          staleQuizIds,
          control,
        );
        for (const removed of snapshot.contentV2.quizzes.filter((item) =>
          item.topicId === topicId && marketplaceTopicState(item.marketplace) === "removed")) {
          const publishedAt = new Date().toISOString();
          await recordContentV2Published(removed.filePath, removed.localHash, publishedAt);
          await writeContentV2QuizPublishState(removed.filePath, { schemaVersion: 1, targets: {} });
          publishedQuizResults.push({ key: removed.key, contentHash: removed.localHash, publishedAt });
        }
        // Publish the catalog entry last so it never advertises a quiz early.
        const result = await publishing.publishContentV2Topic(
          topic,
          summary.localHash,
          reviewedQuizzes.map((quiz) => quiz.id),
        );
        await recordContentV2Published(
          summary.filePath,
          result.contentHash,
          result.publishedAt,
        );
        await control.advance("Published topic document");
        // The marketplace record is the final commit in this job. A catalog
        // entry can therefore never point at partially synchronized content.
        const marketState = marketplaceTopicState(topic.marketplace);
        const marketTopic = {
          ...topic,
          marketplace: withMarketplaceTopicState(topic.marketplace, marketState),
        };
        const marketplaceHash = hashContentV2(
          sanitizeMarketplaceTopic(marketTopic),
        );
        const marketplaceResult =
          marketState !== "removed" && summary.marketplacePublishedHash === marketplaceHash
            ? {
                kind: "topic" as const,
                topicId,
                contentHash: marketplaceHash,
                publishedAt:
                  summary.marketplacePublishedAt ?? new Date().toISOString(),
              }
            : await syncMarketplaceTopic(
                publishing,
                marketTopic,
                marketplaceHash,
                marketState,
              );
        const savedTopic = await saveContentV2Topic(root, {
          ...marketTopic,
          marketplace: syncedMarketplaceMetadata(
            marketTopic.marketplace, marketState, marketplaceResult,
          ),
        });
        await control.advance(
          marketState === "removed"
            ? "Removed marketplace catalog document"
            : "Synchronized marketplace catalog document",
        );
        if (snapshotState.value) {
          const publishedByKey = new Map(
            publishedQuizResults.map((item) => [item.key, item]),
          );
          snapshotState.value = {
            ...snapshotState.value,
            contentV2: {
              ...snapshotState.value.contentV2,
              topics: snapshotState.value.contentV2.topics.map((item) =>
                item.id === topicId
                  ? {
                      ...item,
                      publishedHash: result.contentHash,
                      publishedAt: result.publishedAt,
                      marketplace: savedTopic.marketplace,
                      marketplaceLocalHash: marketplaceHash,
                      marketplacePublishedHash:
                        marketState === "removed" ? null : marketplaceResult.contentHash,
                      marketplacePublishedAt:
                        marketState === "removed" ? null : marketplaceResult.publishedAt,
                    }
                  : item,
              ),
              quizzes: snapshotState.value.contentV2.quizzes.map((item) => {
                const published = publishedByKey.get(item.key);
                return published
                  ? {
                      ...item,
                      publishedHash: published.contentHash,
                      publishedAt: published.publishedAt,
                    }
                  : item;
              }),
            },
          };
        }
        return { ...result, snapshot: requireSnapshot() };
      },
    );
  },
);
ipcMain.handle(
  "content-v2:quiz:publish-preview",
  async (_event, topicId: unknown, quizId: unknown) => {
    if (typeof topicId !== "string" || typeof quizId !== "string")
      throw new Error("Invalid quiz selection.");
    const root = await repositoryRoot();
    const snapshot = requireSnapshot();
    const summary = snapshot.contentV2.quizzes.find(
      (item) => item.topicId === topicId && item.id === quizId,
    );
    if (!summary) throw new Error("The selected quiz was not found.");
    const quiz = await loadContentV2Quiz(root, topicId, quizId);
    const topic = await loadContentV2Topic(root, topicId);
    const questionIds = snapshot.contentV2.questions
      .filter(
        (question) =>
          question.topicId === topicId && question.quizId === quizId,
      )
      .sort((left, right) => left.order - right.order)
      .map((question) => question.id);
    const [questions, resources] = await Promise.all([
      Promise.all(
        questionIds.map((questionId) =>
          loadContentV2Question(root, topicId, quizId, questionId),
        ),
      ),
      loadContentV2QuizResources(root, topicId, quiz),
    ]);
    const assets = await loadContentV2Assets(root, topicId, quizId, {
      topic,
      quiz,
      questions,
      resources,
    });
    return createContentV2QuizPublishPreview(
      topicId,
      quiz,
      questions,
      resources,
      assets,
      summary.localHash,
    );
  },
);
ipcMain.handle(
  "content-v2:quiz:publish",
  async (_event, topicId: unknown, quizId: unknown) => {
    if (typeof topicId !== "string" || typeof quizId !== "string")
      throw new Error("Invalid quiz selection.");
    const root = await repositoryRoot();
    const snapshot = requireSnapshot();
    const summary = snapshot.contentV2.quizzes.find(
      (item) => item.topicId === topicId && item.id === quizId,
    );
    if (!summary) throw new Error("The selected quiz was not found.");
    if (summary.questionCount !== summary.reviewedQuestionCount)
      throw new Error("Review every question before publishing this quiz.");
    return publishJobs.track(
      {
        name: `Publish · ${summary.title}`,
        description: `Publish ${summary.questionCount} questions to Firebase`,
        route: `/topics/${encodeURIComponent(topicId)}/quizzes/${encodeURIComponent(quizId)}?tab=publish`,
      },
      async (control) => {
        await control.setTotal(
          Math.max(1, summary.questionCount + 1),
          `Preparing questions 0/${summary.questionCount}`,
        );
        const quiz = await loadContentV2Quiz(root, topicId, quizId);
        const topic = await loadContentV2Topic(root, topicId);
        const questionIds = snapshot.contentV2.questions
          .filter(
            (question) =>
              question.topicId === topicId && question.quizId === quizId,
          )
          .sort((left, right) => left.order - right.order)
          .map((question) => question.id);
        let preparedQuestions = 0;
        const [questions, resources] = await Promise.all([
          Promise.all(
            questionIds.map(async (questionId) => {
              const question = await loadContentV2Question(
                root,
                topicId,
                quizId,
                questionId,
              );
              preparedQuestions += 1;
              await control.advance(
                `Preparing questions ${preparedQuestions}/${questionIds.length}`,
              );
              return question;
            }),
          ),
          loadContentV2QuizResources(root, topicId, quiz),
        ]);
        const assets = await loadContentV2Assets(root, topicId, quizId, {
          topic,
          quiz,
          questions,
          resources,
        });
        const topicSummary = snapshot.contentV2.topics.find(
          (item) => item.id === topicId,
        );
        if (!topicSummary)
          throw new Error("The containing topic was not found.");
        const topicQuizIds = reviewedTopicQuizzes(
          snapshot.contentV2.quizzes,
          topicId,
        ).filter((item) => marketplaceTopicState(item.marketplace) !== "removed")
          .map((item) => item.id);
        await control.checkpoint();
        if (!firebaseAuth) throw new Error("Publishing is not initialized.");
        const target = await firebaseAuth.publishingTarget();
        const publishContainingTopic = shouldPublishContainingTopic(
          await publishing.contentV2TopicExists(topicId),
        );
        const publishState = await readContentV2QuizPublishState(
          summary.filePath,
        );
        const result = await publishing.publishContentV2Quiz(
          topicId,
          quiz,
          questions,
          resources,
          assets,
          summary.localHash,
          publishState.targets[target.projectId],
          control,
          publishContainingTopic ? 2 : 0,
        );
        const topicResult = publishContainingTopic
          ? await publishing.publishContentV2Topic(
              topic,
              topicSummary.localHash,
              topicQuizIds,
              control,
            )
          : null;
        await recordContentV2Published(
          summary.filePath,
          result.contentHash,
          result.publishedAt,
        );
        if (topicResult)
          await recordContentV2Published(
            topicSummary.filePath,
            topicResult.contentHash,
            topicResult.publishedAt,
          );
        await writeContentV2QuizPublishState(summary.filePath, {
          schemaVersion: 1,
          targets: {
            ...publishState.targets,
            [result.projectId]: {
              environment: result.environment,
              projectId: result.projectId,
              contentHash: result.contentHash,
              publishedAt: result.publishedAt,
              items: result.items,
            },
          },
        });
        if (snapshotState.value)
          snapshotState.value = {
            ...snapshotState.value,
            contentV2: {
              ...snapshotState.value.contentV2,
              quizzes: snapshotState.value.contentV2.quizzes.map((item) =>
                item.topicId === topicId && item.id === quizId
                  ? {
                      ...item,
                      publishedHash: result.contentHash,
                      publishedAt: result.publishedAt,
                    }
                  : item,
              ),
              topics: snapshotState.value.contentV2.topics.map((item) =>
                topicResult && item.id === topicId
                  ? {
                      ...item,
                      publishedHash: topicResult.contentHash,
                      publishedAt: topicResult.publishedAt,
                    }
                  : item,
              ),
            },
          };
        return { ...result, snapshot: requireSnapshot() };
      },
    );
  },
);

}
