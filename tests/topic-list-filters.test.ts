import assert from "node:assert/strict";
import test from "node:test";
import type { ContentV2TopicSummary } from "../src/shared/domain/models";
import {
  topicFilterGrades,
  topicFilterSubjects,
  topicMatchesFilters,
} from "../src/features/topics/domain/topic-list-filters.js";

const topic = {
  id: "maths-grade-3",
  type: "competition",
  title: "Maths",
  description: "",
  status: "reviewed",
  order: 0,
  filePath: "/topic.json",
  localHash: "local",
  publishedHash: null,
  publishedAt: null,
  quizCount: 1,
  subject: "mathematics",
  gradeGroups: [{ id: "primary", title: "Primary", grades: [3, 4] }],
  marketplace: { subjects: ["Mathematics", "English"] },
} satisfies ContentV2TopicSummary;

test("topic filters derive unique normalized grades and subjects", () => {
  assert.deepEqual(topicFilterGrades(topic), ["3", "4"]);
  assert.deepEqual(topicFilterSubjects(topic), ["mathematics", "english"]);
});

test("topic filters use OR within a filter and AND between filters", () => {
  assert.equal(topicMatchesFilters(topic, ["2", "3"], ["english"]), true);
  assert.equal(topicMatchesFilters(topic, ["2"], ["english"]), false);
  assert.equal(topicMatchesFilters(topic, ["3"], ["science"]), false);
  assert.equal(topicMatchesFilters(topic, [], []), true);
});
