import { promises as fs } from "node:fs";
import path from "node:path";
import {
  loadContentV2Quiz,
  loadContentV2Question,
  loadContentV2Topic,
  patchContentV2QuizMarketplacePolicy,
  patchContentV2TopicMarketplacePolicy,
  reconcileContentV2GuestPreview,
} from "../src/features/topics/repository/content-v2-repository.js";
import { marketplaceAccessPlan } from "../src/features/topics/domain/marketplace-access-plan.js";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const repositoryIndex = args.indexOf("--repository");
const topicIndex = args.indexOf("--topic");
const repositoryPath = repositoryIndex >= 0 ? path.resolve(args[repositoryIndex + 1] ?? "") : "";
const requestedTopic = topicIndex >= 0 ? args[topicIndex + 1] : undefined;
if (!repositoryPath) throw new Error("Use --repository <tnp-getgo-quizzes path>.");

const topicsRoot = path.join(repositoryPath, "content-v2", "topics");
const topicDirectories = (await fs.readdir(topicsRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && (!requestedTopic || entry.name === requestedTopic))
  .sort((left, right) => left.name.localeCompare(right.name));
if (requestedTopic && !topicDirectories.length) throw new Error(`Topic ${requestedTopic} was not found.`);

let issueCount = 0;
let changeCount = 0;
for (const entry of topicDirectories) {
  const topic = await loadContentV2Topic(repositoryPath, entry.name);
  const issues: string[] = [];
  const warnings: string[] = [];
  if (topic.marketplace?.preview !== true) issues.push("topic guest preview is not enabled");
  if (topic.marketplace?.experimental === true) issues.push("topic is experimental");
  if (topic.marketplace?.pricing?.type !== "subscription") issues.push("topic pricing is not Premium");

  const quizzesRoot = path.join(topicsRoot, topic.id, "quizzes");
  const quizDirectories = (await fs.readdir(quizzesRoot, { withFileTypes: true }).catch(() => []))
    .filter((quiz) => quiz.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name));
  const previewCandidates: Array<{
    id: string; order: number; preview: boolean; questionCount: number; reviewedQuestionCount: number;
  }> = [];
  for (const quizEntry of quizDirectories) {
    const quiz = await loadContentV2Quiz(repositoryPath, topic.id, quizEntry.name);
    const questionsRoot = path.join(quizzesRoot, quiz.id, "questions");
    const questionFiles = (await fs.readdir(questionsRoot, { withFileTypes: true }).catch(() => []))
      .filter((question) => question.isFile() && question.name.endsWith(".json"));
    const questions = await Promise.all(questionFiles.map((question) =>
      loadContentV2Question(repositoryPath, topic.id, quiz.id, question.name.slice(0, -5))));
    previewCandidates.push({
      id: quiz.id,
      order: quiz.order,
      preview: quiz.marketplace?.preview === true,
      questionCount: questions.length,
      reviewedQuestionCount: questions.filter((question) => question.status === "reviewed").length,
    });
  }

  const plan = marketplaceAccessPlan(previewCandidates);
  const expectedPreview = plan.previewIds;
  const expectedFree = new Set(plan.freeIds);
  const actualPreviews = previewCandidates.filter((quiz) => quiz.preview).map((quiz) => quiz.id);
  if (actualPreviews.join("|") !== expectedPreview.join("|"))
    issues.push(`guest previews should be ${expectedPreview.join(", ") || "none"}`);
  for (const quiz of previewCandidates) {
    const loaded = await loadContentV2Quiz(repositoryPath, topic.id, quiz.id);
    const shouldBeFree = expectedFree.has(quiz.id);
    const pricingType = loaded.marketplace?.pricing?.type;
    if (shouldBeFree ? pricingType !== "free" : pricingType !== undefined)
      issues.push(`${quiz.id} should ${shouldBeFree ? "be Free" : "inherit Premium pricing"}`);
    if (apply && (shouldBeFree ? pricingType !== "free" : pricingType !== undefined)) {
      await patchContentV2QuizMarketplacePolicy(repositoryPath, topic.id, quiz.id, shouldBeFree
        ? { pricing: { type: "free", currency: "VND" } }
        : { inheritPricing: true });
      changeCount += 1;
    }
  }

  if (apply && issues.some((issue) => issue.startsWith("topic "))) {
    await patchContentV2TopicMarketplacePolicy(repositoryPath, topic.id, {
      preview: true,
      experimental: false,
      pricing: { type: "subscription", currency: "VND" },
    });
    changeCount += 1;
  }
  if (apply) {
    const reconciliation = await reconcileContentV2GuestPreview(repositoryPath, topic.id);
    changeCount += reconciliation.changedQuizIds.length;
  }
  issueCount += issues.length;
  const details = [...issues, ...warnings.map((warning) => `warning: ${warning}`)];
  console.log(`${topic.id}: ${details.length ? details.join("; ") : "OK"}`);
}

console.log(`${apply ? "Applied" : "Audited"}: ${topicDirectories.length} topics, ${issueCount} issues, ${changeCount} changes.`);
