import path from "node:path";
import { promises as fs } from "node:fs";
import {
  contentV2QuizPublishContractVersion,
  contentV2TopicPublishContractVersion,
  hashContentV2,
  marketplaceContentAccess,
  marketplaceTopicState,
  sanitizeMarketplaceTopic,
} from "../src/features/topics/domain/content-v2.js";
import {
  contentV2PublishedItems,
  publishedItemKey,
  type ContentV2PublishedItem,
} from "../src/features/topics/domain/content-v2-publish-state.js";
import {
  loadContentV2Assets,
  loadContentV2Question,
  loadContentV2Quiz,
  loadContentV2QuizResources,
  loadContentV2Topic,
  loadContentV2TopicAssets,
  loadContentV2WorkspaceFromFiles,
  readContentV2QuizPublishState,
  readContentV2TopicPublishState,
  recordContentV2Published,
  writeContentV2QuizPublishState,
  writeContentV2TopicPublishState,
} from "../src/features/topics/repository/content-v2-repository.js";
import { createContentV2QuizPublishPreview } from "../src/features/topics/main/firestore-publishing.js";
import { marketplaceSyncPlan } from "../src/features/topics/domain/marketplace-sync-plan.js";

type Environment = "development" | "staging" | "production";

const projectIds: Record<Environment, string> = {
  development: "tnp-getgo-dev",
  staging: "tnp-getgo-staging",
  production: "tnp-getgo",
};

const args = process.argv.slice(2);
const repositoryPath = path.resolve(args.find((arg) => !arg.startsWith("--")) ?? "../tnp-getgo-quizzes");
const environmentArg = args.find((arg) => arg.startsWith("--environment="))?.split("=")[1] ?? "development";
if (!(environmentArg in projectIds)) throw new Error(`Unknown environment: ${environmentArg}`);
const environment = environmentArg as Environment;
const projectId = projectIds[environment];
const apply = args.includes("--apply");
const publishedAt = new Date().toISOString();

const loaded = (await loadContentV2WorkspaceFromFiles(repositoryPath, { lightweight: false })).content;
if (loaded.issues.length) {
  throw new Error(`Cannot baseline invalid content:\n${loaded.issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n")}`);
}

let topics = 0;
let quizzes = 0;
let questions = 0;
let resources = 0;
let assets = 0;
let skippedUnreviewed = 0;
let clearedUnlisted = 0;

for (const topicSummary of loaded.topics) {
  const topic = await loadContentV2Topic(repositoryPath, topicSummary.id);
  const topicState = marketplaceTopicState(topic.marketplace);
  const topicQuizzes = loaded.quizzes.filter((quiz) => quiz.topicId === topic.id);
  const previousTopicState = await readContentV2TopicPublishState(topicSummary.filePath);

  if (topicState === "unlisted") {
    const nextTopicState = {
      schemaVersion: 1 as const,
      targets: {
        ...previousTopicState.targets,
        [projectId]: { environment, projectId, contentHash: null, marketplaceContentHash: null, publishedAt },
      },
    };
    if (apply) await writeContentV2TopicPublishState(topicSummary.filePath, nextTopicState);
    clearedUnlisted += 1;
  } else {
    const topicAssets = await loadContentV2TopicAssets(repositoryPath, topic, false);
    const topicItems = Object.fromEntries(topicAssets.map((asset) => {
      const reference = asset.reference.slice("asset:".length).replaceAll("\\", "/");
      const item: ContentV2PublishedItem = {
        kind: "storage-object",
        path: `getgo-content-v2/topics/${topic.id}/assets/${reference}`,
        hash: asset.contentHash,
      };
      return [publishedItemKey(item), item];
    }));
    const topicDocument: ContentV2PublishedItem = {
      kind: "firestore-document",
      path: `/getgo-content-v2/catalog/topics/${encodeURIComponent(topic.id)}`,
      hash: topicSummary.localHash,
    };
    const marketplaceHash = hashContentV2(sanitizeMarketplaceTopic(topic));
    const marketplaceDocument: ContentV2PublishedItem = {
      kind: "firestore-document",
      path: `/getgo-marketplace-topics/${encodeURIComponent(topic.id)}`,
      hash: marketplaceHash,
    };
    if (apply) {
      await recordContentV2Published(topicSummary.filePath, topicSummary.localHash, publishedAt);
      await writeContentV2TopicPublishState(topicSummary.filePath, {
        schemaVersion: 1,
        targets: {
          ...previousTopicState.targets,
          [projectId]: {
            publishContractVersion: topic.type === "kid-learning" ? contentV2TopicPublishContractVersion : undefined,
            environment,
            projectId,
            contentHash: topicSummary.localHash,
            marketplaceContentHash: marketplaceHash,
            publishedAt,
            items: { ...topicItems, [publishedItemKey(topicDocument)]: topicDocument, [publishedItemKey(marketplaceDocument)]: marketplaceDocument },
          },
        },
      });
    }
    topics += 1;
    assets += topicAssets.length;
  }

  for (const quizSummary of topicQuizzes) {
    const quiz = await loadContentV2Quiz(repositoryPath, topic.id, quizSummary.id);
    const previousQuizState = await readContentV2QuizPublishState(quizSummary.filePath);
    const eligible = topicState !== "unlisted"
      && marketplaceTopicState(quiz.marketplace) !== "unlisted"
      && quizSummary.questionCount > 0
      && quizSummary.questionCount === quizSummary.reviewedQuestionCount;
    if (!eligible) {
      if (quizSummary.questionCount !== quizSummary.reviewedQuestionCount) skippedUnreviewed += 1;
      else clearedUnlisted += 1;
      if (apply && previousQuizState.targets[projectId]) {
        const { [projectId]: _removed, ...remainingTargets } = previousQuizState.targets;
        await writeContentV2QuizPublishState(quizSummary.filePath, { schemaVersion: 1, targets: remainingTargets });
      }
      continue;
    }
    const questionIds = loaded.questions
      .filter((question) => question.topicId === topic.id && question.quizId === quiz.id)
      .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
      .map((question) => question.id);
    const [quizQuestions, quizResources] = await Promise.all([
      Promise.all(questionIds.map((id) => loadContentV2Question(repositoryPath, topic.id, quiz.id, id))),
      loadContentV2QuizResources(repositoryPath, topic.id, quiz),
    ]);
    const quizAssets = await loadContentV2Assets(repositoryPath, topic.id, quiz.id, { quiz, questions: quizQuestions, resources: quizResources }, false);
    const preview = createContentV2QuizPublishPreview(
      topic.id,
      quiz,
      marketplaceContentAccess(topic.marketplace),
      quizQuestions,
      quizResources,
      quizAssets,
      quizSummary.localHash,
    );
    if (apply) {
      await recordContentV2Published(quizSummary.filePath, quizSummary.localHash, publishedAt);
      await writeContentV2QuizPublishState(quizSummary.filePath, {
        schemaVersion: 1,
        targets: {
          ...previousQuizState.targets,
          [projectId]: {
            publishContractVersion: contentV2QuizPublishContractVersion,
            environment,
            projectId,
            contentHash: quizSummary.localHash,
            publishedAt,
            items: contentV2PublishedItems(preview),
          },
        },
      });
    }
    quizzes += 1;
    questions += quizQuestions.length;
    resources += Object.keys(quizResources).length;
    assets += quizAssets.length;
  }
}

const verificationContent = apply
  ? (await loadContentV2WorkspaceFromFiles(repositoryPath, { lightweight: true, projectId })).content
  : null;
const verificationPlan = verificationContent
  ? marketplaceSyncPlan(verificationContent.topics, verificationContent.quizzes)
  : [];
const result = {
  mode: apply ? "applied" : "dry-run",
  environment,
  projectId,
  repositoryPath,
  topics,
  quizzes,
  questions,
  resources,
  assets,
  skippedUnreviewed,
  clearedUnlisted,
  publishedAt,
  ...(verificationContent ? {
    verification: {
      issues: verificationContent.issues.length,
      actionable: verificationPlan.filter((item) => item.ready).length,
      awaitingReview: verificationPlan.filter((item) => !item.ready).length,
    },
  } : {}),
};
if (apply)
  await fs.writeFile(path.join(repositoryPath, "content-v2", `.publish-baseline-${projectId}.json`), `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(JSON.stringify(result, null, 2));
