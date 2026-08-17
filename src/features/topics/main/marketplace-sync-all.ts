import { hashContentV2, marketplaceTopicState, sanitizeMarketplaceTopic } from "../../../features/topics/domain/content-v2.js";
import type { MarketplaceSyncJobItem } from "../../../shared/domain/models.js";
import { reviewedTopicQuizzes } from "../domain/content-v2-publish-policy.js";
import { marketplaceSyncPlan } from "../domain/marketplace-sync-plan.js";
import { clearContentV2Published, loadContentV2Assets, loadContentV2Question, loadContentV2Quiz, loadContentV2QuizResources, loadContentV2Topic, loadContentV2TopicFolder, readContentV2QuizPublishState, readContentV2TopicPublishState, recordContentV2Published, saveContentV2Topic, writeContentV2QuizPublishState, writeContentV2TopicPublishState } from "../repository/content-v2-repository.js";
import type { FirebaseAuthService } from "../../authentication/main/firebase-auth.js";
import type { FirestorePublishingService } from "./firestore-publishing.js";
import { syncMarketplaceTopic, syncedMarketplaceMetadata } from "./marketplace-sync.js";
import type { PublishJobControl } from "../../jobs/main/publish-jobs.js";

export async function syncAllMarketplaceTopics(
  root: string,
  requestedPlan: MarketplaceSyncJobItem[],
  publishing: FirestorePublishingService,
  firebaseAuth: FirebaseAuthService,
  control: PublishJobControl,
): Promise<void> {
  await control.setTotal(requestedPlan.length, "Initializing marketplace sync");
  const target = await firebaseAuth.publishingTarget();
  const topicIds = [...new Set(requestedPlan.map((item) => item.topicId))];
  for (const topicId of topicIds) {
    await control.checkpoint();
    const content = (await loadContentV2TopicFolder(root, topicId, {
      lightweight: false,
      projectId: target.projectId,
    })).content;
    let next = content;
    const requested = requestedPlan.filter((item) => item.topicId === topicId);
    const requestedKeys = new Set(requested.map((item) => item.kind === "quiz" ? `quiz:${item.quizId}` : "topic"));
    const plan = marketplaceSyncPlan(content.topics, content.quizzes).filter((item) => item.ready);
    // Once a topic is selected, synchronize its complete actionable plan. This
    // prevents a stale renderer request from leaving newer filesystem changes
    // behind and guarantees the next plan for this target is empty.
    const topicPlan = plan;
    const topicSummary = next.topics.find((item) => item.id === topicId);
    if (!topicSummary) throw new Error(`Topic ${topicId} was not found.`);
    const topic = await loadContentV2Topic(root, topicId);
    const state = marketplaceTopicState(topic.marketplace);
    if (state === "unlisted") {
      const topicQuizzes = next.quizzes.filter((item) => item.topicId === topicId);
      for (const quiz of topicQuizzes) {
        const publishState = await readContentV2QuizPublishState(quiz.filePath);
        await publishing.removeContentV2StorageItems(publishState.targets[target.projectId], control);
        await clearContentV2Published(quiz.filePath);
        const { [target.projectId]: _removed, ...remainingTargets } = publishState.targets;
        await writeContentV2QuizPublishState(quiz.filePath, { schemaVersion: 1, targets: remainingTargets });
        if (requestedKeys.has(`quiz:${quiz.id}`))
          await control.advance(`Removed quiz · ${quiz.title}`);
      }
      await publishing.removeContentV2Topic(topicId, control);
      await clearContentV2Published(topicSummary.filePath);
      const saved = await saveContentV2Topic(root, {
        ...topic,
        marketplace: syncedMarketplaceMetadata(topic.marketplace, state, {
          contentHash: hashContentV2(sanitizeMarketplaceTopic(topic)),
          publishedAt: new Date().toISOString(),
        }),
      });
      next = { ...next,
        topics: next.topics.map((item) => item.id === topicId ? { ...item, publishedHash: null, publishedAt: null, marketplace: saved.marketplace, marketplacePublishedHash: null, marketplacePublishedAt: null } : item),
        quizzes: next.quizzes.map((item) => item.topicId === topicId ? { ...item, publishedHash: null, publishedAt: null } : item),
      };
      const previousTopicState = await readContentV2TopicPublishState(topicSummary.filePath);
      await writeContentV2TopicPublishState(topicSummary.filePath, {
        schemaVersion: 1,
        targets: {
          ...previousTopicState.targets,
          [target.projectId]: {
            environment: target.environment,
            projectId: target.projectId,
            contentHash: null,
            marketplaceContentHash: null,
            publishedAt: new Date().toISOString(),
          },
        },
      });
      await control.advance(`Removed topic data · ${topicSummary.title}`);
      const verified = (await loadContentV2TopicFolder(root, topicId, {
        lightweight: true,
        projectId: target.projectId,
      })).content;
      if (marketplaceSyncPlan(verified.topics, verified.quizzes).some((item) => item.ready))
        throw new Error(`Synchronization did not settle ${topicId}.`);
      continue;
    }
    const quizResults = new Map<string, { contentHash: string; publishedAt: string }>();
    const removedQuizKeys = new Set<string>();
    for (const item of topicPlan) {
      if (item.kind !== "quiz") continue;
      const summary = item.quiz;
      if (item.action === "remove") {
        await publishing.deleteContentV2TopicQuizzes(topicId, [summary.id]);
        await clearContentV2Published(summary.filePath);
        const previous = await readContentV2QuizPublishState(summary.filePath);
        const { [target.projectId]: _removed, ...remainingTargets } = previous.targets;
        await writeContentV2QuizPublishState(summary.filePath, { schemaVersion: 1, targets: remainingTargets });
        removedQuizKeys.add(summary.key);
        await control.advance(`Removed quiz · ${summary.title}`);
        continue;
      }
      const quiz = await loadContentV2Quiz(root, topicId, summary.id);
      const questionIds = next.questions.filter((question) => question.topicId === topicId && question.quizId === summary.id).sort((a, b) => a.order - b.order).map((question) => question.id);
      const [questions, resources] = await Promise.all([
        Promise.all(questionIds.map((id) => loadContentV2Question(root, topicId, summary.id, id))),
        loadContentV2QuizResources(root, topicId, quiz),
      ]);
      const assets = await loadContentV2Assets(root, topicId, summary.id, { quiz, questions, resources });
      const previous = await readContentV2QuizPublishState(summary.filePath);
      const result = await publishing.publishContentV2Quiz(topicId, quiz, questions, resources, assets, summary.localHash, previous.targets[target.projectId]);
      await recordContentV2Published(summary.filePath, result.contentHash, result.publishedAt);
      await writeContentV2QuizPublishState(summary.filePath, { schemaVersion: 1, targets: { ...previous.targets, [result.projectId]: { environment: result.environment, projectId: result.projectId, contentHash: result.contentHash, publishedAt: result.publishedAt, items: result.items } } });
      quizResults.set(summary.key, result);
      await control.advance(`Synchronized quiz · ${summary.title}`);
    }
    const reviewedQuizIds = reviewedTopicQuizzes(next.quizzes, topicId).filter((quiz) => marketplaceTopicState(quiz.marketplace) !== "unlisted").map((quiz) => quiz.id);
    const topicAssets = await loadContentV2Assets(root, topicId, undefined, { topic });
    await publishing.uploadContentV2TopicAssets(topicId, topicAssets, control);
    const topicResult = await publishing.publishContentV2Topic(topic, topicSummary.localHash, reviewedQuizIds);
    await recordContentV2Published(topicSummary.filePath, topicResult.contentHash, topicResult.publishedAt);
    const marketplaceHash = hashContentV2(sanitizeMarketplaceTopic(topic));
    const marketResult = await syncMarketplaceTopic(publishing, topic, marketplaceHash, state);
    const saved = await saveContentV2Topic(root, {
      ...topic,
      publishedHash: topicResult.contentHash,
      publishedAt: topicResult.publishedAt,
      marketplace: syncedMarketplaceMetadata(topic.marketplace, state, marketResult),
    });
    const previousTopicState = await readContentV2TopicPublishState(topicSummary.filePath);
    await writeContentV2TopicPublishState(topicSummary.filePath, {
      schemaVersion: 1,
      targets: {
        ...previousTopicState.targets,
        [target.projectId]: {
          environment: target.environment,
          projectId: target.projectId,
          contentHash: topicResult.contentHash,
          marketplaceContentHash: marketResult.contentHash,
          publishedAt: marketResult.publishedAt,
        },
      },
    });
    next = { ...next,
      topics: next.topics.map((item) => item.id === topicId ? { ...item, publishedHash: topicResult.contentHash, publishedAt: topicResult.publishedAt, marketplace: saved.marketplace, marketplaceLocalHash: marketplaceHash, marketplacePublishedHash: marketResult.contentHash, marketplacePublishedAt: marketResult.publishedAt } : item),
      quizzes: next.quizzes.map((item) => { if (removedQuizKeys.has(item.key)) return { ...item, publishedHash: null, publishedAt: null }; const result = quizResults.get(item.key); return result ? { ...item, publishedHash: result.contentHash, publishedAt: result.publishedAt } : item; }),
    };
    if (topicPlan.some((item) => item.kind === "topic"))
      await control.advance(`Synchronized topic · ${topicSummary.title}`);
    const processedKeys = new Set(topicPlan.map((item) => item.kind === "quiz" ? `quiz:${item.quiz.id}` : "topic"));
    for (const item of requested)
      if (!processedKeys.has(item.kind === "quiz" ? `quiz:${item.quizId}` : "topic"))
        await control.advance(`Skipped item already synchronized · ${item.kind === "quiz" ? item.quizId : topicId}`);

    const verified = (await loadContentV2TopicFolder(root, topicId, {
      lightweight: true,
      projectId: target.projectId,
    })).content;
    const remaining = marketplaceSyncPlan(verified.topics, verified.quizzes)
      .filter((item) => item.ready);
    if (remaining.length > 0)
      throw new Error(`Synchronization did not settle ${topicId}: ${remaining.map((item) => item.kind === "quiz" ? item.quiz.id : item.topic.id).join(", ")}`);
  }
}
