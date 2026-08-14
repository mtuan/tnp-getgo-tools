import { hashContentV2, marketplaceTopicState, sanitizeMarketplaceTopic } from "../../../features/topics/domain/content-v2.js";
import type { RepositorySnapshot } from "../../../shared/domain/models.js";
import { reviewedTopicQuizzes } from "../domain/content-v2-publish-policy.js";
import { marketplaceSyncPlan } from "../domain/marketplace-sync-plan.js";
import { loadContentV2Assets, loadContentV2Question, loadContentV2Quiz, loadContentV2QuizResources, loadContentV2Topic, readContentV2QuizPublishState, recordContentV2Published, saveContentV2Topic, writeContentV2QuizPublishState } from "../repository/content-v2-repository.js";
import type { FirebaseAuthService } from "../../authentication/main/firebase-auth.js";
import type { FirestorePublishingService } from "./firestore-publishing.js";
import { syncMarketplaceTopic, syncedMarketplaceMetadata } from "./marketplace-sync.js";
import type { PublishJobControl } from "../../jobs/main/publish-jobs.js";

export async function syncAllMarketplaceTopics(
  root: string,
  snapshot: RepositorySnapshot,
  publishing: FirestorePublishingService,
  firebaseAuth: FirebaseAuthService,
  control: PublishJobControl,
): Promise<RepositorySnapshot> {
  const plan = marketplaceSyncPlan(snapshot.contentV2.topics, snapshot.contentV2.quizzes)
    .filter((item) => item.ready);
  await control.setTotal(plan.length, "Preparing topic and quiz synchronization");
  const target = await firebaseAuth.publishingTarget();
  let next = snapshot;
  const topicIds = [...new Set(plan.map((item) => item.topic.id))];
  for (const topicId of topicIds) {
    const topicSummary = next.contentV2.topics.find((item) => item.id === topicId)!;
    const topic = await loadContentV2Topic(root, topicId);
    const topicPlan = plan.filter((item) => item.topic.id === topicId);
    const quizResults = new Map<string, { contentHash: string; publishedAt: string }>();
    for (const item of topicPlan) {
      if (item.kind !== "quiz") continue;
      const summary = item.quiz;
      if (item.action === "remove") {
        await publishing.deleteContentV2TopicQuizzes(topicId, [summary.id]);
        const publishedAt = new Date().toISOString();
        await recordContentV2Published(summary.filePath, summary.localHash, publishedAt);
        await writeContentV2QuizPublishState(summary.filePath, { schemaVersion: 1, targets: {} });
        quizResults.set(summary.key, { contentHash: summary.localHash, publishedAt });
        await control.advance(`Removed quiz · ${summary.title}`);
        continue;
      }
      const quiz = await loadContentV2Quiz(root, topicId, summary.id);
      const questionIds = next.contentV2.questions.filter((question) => question.topicId === topicId && question.quizId === summary.id).sort((a, b) => a.order - b.order).map((question) => question.id);
      const [questions, resources] = await Promise.all([
        Promise.all(questionIds.map((id) => loadContentV2Question(root, topicId, summary.id, id))),
        loadContentV2QuizResources(root, topicId, quiz),
      ]);
      const assets = await loadContentV2Assets(root, topicId, summary.id, { topic, quiz, questions, resources });
      const previous = await readContentV2QuizPublishState(summary.filePath);
      const result = await publishing.publishContentV2Quiz(topicId, quiz, questions, resources, assets, summary.localHash, previous.targets[target.projectId]);
      await recordContentV2Published(summary.filePath, result.contentHash, result.publishedAt);
      await writeContentV2QuizPublishState(summary.filePath, { schemaVersion: 1, targets: { ...previous.targets, [result.projectId]: { environment: result.environment, projectId: result.projectId, contentHash: result.contentHash, publishedAt: result.publishedAt, items: result.items } } });
      quizResults.set(summary.key, result);
      await control.advance(`Synchronized quiz · ${summary.title}`);
    }
    const reviewedQuizIds = reviewedTopicQuizzes(next.contentV2.quizzes, topicId).filter((quiz) => marketplaceTopicState(quiz.marketplace) !== "removed").map((quiz) => quiz.id);
    const topicResult = await publishing.publishContentV2Topic(topic, topicSummary.localHash, reviewedQuizIds);
    await recordContentV2Published(topicSummary.filePath, topicResult.contentHash, topicResult.publishedAt);
    const state = marketplaceTopicState(topic.marketplace);
    const marketplaceHash = hashContentV2(sanitizeMarketplaceTopic(topic));
    const marketResult = await syncMarketplaceTopic(publishing, topic, marketplaceHash, state);
    const saved = await saveContentV2Topic(root, { ...topic, marketplace: syncedMarketplaceMetadata(topic.marketplace, state, marketResult) });
    next = { ...next, contentV2: { ...next.contentV2,
      topics: next.contentV2.topics.map((item) => item.id === topicId ? { ...item, publishedHash: topicResult.contentHash, publishedAt: topicResult.publishedAt, marketplace: saved.marketplace, marketplaceLocalHash: marketplaceHash, marketplacePublishedHash: state === "removed" ? null : marketResult.contentHash, marketplacePublishedAt: state === "removed" ? null : marketResult.publishedAt } : item),
      quizzes: next.contentV2.quizzes.map((item) => { const result = quizResults.get(item.key); return result ? { ...item, publishedHash: result.contentHash, publishedAt: result.publishedAt } : item; }),
    } };
    if (topicPlan.some((item) => item.kind === "topic"))
      await control.advance(`Synchronized topic · ${topicSummary.title}`);
  }
  return next;
}
