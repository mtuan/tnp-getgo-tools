import type { ContentV2TopicSummary } from "../../../shared/domain/models.js";
import { marketplaceTopicState } from "./marketplace-topic-state.js";

const normalize = (value: string) => value.trim().toLocaleLowerCase();

export function topicFilterGrades(topic: ContentV2TopicSummary): string[] {
  return Array.from(
    new Set(
      (topic.gradeGroups ?? []).flatMap((group) =>
        group.grades.map(String),
      ),
    ),
  );
}

export function topicFilterSubjects(topic: ContentV2TopicSummary): string[] {
  return Array.from(
    new Set(
      [topic.subject, ...(topic.marketplace?.subjects ?? [])]
        .filter((value): value is string => Boolean(value?.trim()))
        .map(normalize),
    ),
  );
}

export function topicFilterContests(topic: ContentV2TopicSummary): string[] {
  return topic.contestId?.trim() ? [normalize(topic.contestId)] : [];
}

export function topicFilterStates(topic: ContentV2TopicSummary): string[] {
  return [marketplaceTopicState(topic.marketplace)];
}

export function topicMatchesFilters(
  topic: ContentV2TopicSummary | undefined,
  grades: string[],
  subjects: string[],
  contests: string[] = [],
  states: string[] = [],
): boolean {
  if (!topic)
    return grades.length === 0 && subjects.length === 0 && contests.length === 0 && states.length === 0;
  const topicGrades = topicFilterGrades(topic);
  const topicSubjects = topicFilterSubjects(topic);
  const topicContests = topicFilterContests(topic);
  const topicStates = topicFilterStates(topic);
  return (
    (grades.length === 0 || grades.some((grade) => topicGrades.includes(grade))) &&
    (subjects.length === 0 ||
      subjects.some((subject) => topicSubjects.includes(normalize(subject)))) &&
    (contests.length === 0 ||
      contests.some((contest) => topicContests.includes(normalize(contest)))) &&
    (states.length === 0 ||
      states.some((state) => topicStates.includes(normalize(state))))
  );
}
