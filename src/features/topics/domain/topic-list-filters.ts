import type { ContentV2TopicSummary } from "../../../shared/domain/models.js";

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

export function topicMatchesFilters(
  topic: ContentV2TopicSummary | undefined,
  grades: string[],
  subjects: string[],
): boolean {
  if (!topic) return grades.length === 0 && subjects.length === 0;
  const topicGrades = topicFilterGrades(topic);
  const topicSubjects = topicFilterSubjects(topic);
  return (
    (grades.length === 0 || grades.some((grade) => topicGrades.includes(grade))) &&
    (subjects.length === 0 ||
      subjects.some((subject) => topicSubjects.includes(normalize(subject))))
  );
}
