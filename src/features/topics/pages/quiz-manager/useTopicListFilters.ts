import { useCallback, useMemo, useState } from "react";
import type { ContentV2TopicSummary } from "../../../../shared/domain/models";
import en from "../../../../shared/localization/en.json";
import vi from "../../../../shared/localization/vi.json";
import {
  topicFilterContests,
  topicFilterGrades,
  topicFilterStates,
  topicFilterSubjects,
  topicMatchesFilters,
} from "../../domain/topic-list-filters";

export function useTopicListFilters(
  topics: ContentV2TopicSummary[],
  locale: "en" | "vi",
) {
  const [topicGrades, setTopicGrades] = useState<string[]>([]);
  const [topicSubjects, setTopicSubjects] = useState<string[]>([]);
  const [topicContests, setTopicContests] = useState<string[]>([]);
  const [topicStates, setTopicStates] = useState<string[]>([]);
  const copy = (locale === "vi" ? vi : en).marketplaceManager.filters;
  const topicGradeOptions = useMemo(
    () =>
      Array.from(new Set(topics.flatMap(topicFilterGrades)))
        .sort((left, right) => Number(left) - Number(right))
        .map((grade) => ({
          value: grade,
          label:
            grade === "0"
              ? copy.kindergarten
              : copy.grade.replace("{grade}", grade),
        })),
    [copy, topics],
  );
  const topicSubjectOptions = useMemo(
    () =>
      Array.from(new Set(topics.flatMap(topicFilterSubjects)))
        .sort((left, right) => left.localeCompare(right, locale))
        .map((subject) => ({
          value: subject,
          label:
            copy.subjectNames[
              subject as keyof typeof copy.subjectNames
            ] ??
            subject.replace(/(^|[-_\s])\p{L}/gu, (value) =>
              value.toLocaleUpperCase(locale),
            ),
        })),
    [copy, locale, topics],
  );
  const topicContestOptions = useMemo(
    () =>
      Array.from(new Set(topics.flatMap(topicFilterContests)))
        .sort((left, right) => left.localeCompare(right, locale))
        .map((contest) => ({
          value: contest,
          label: contest.toLocaleUpperCase(locale),
        })),
    [locale, topics],
  );
  const topicStateOptions = useMemo(
    () =>
      Array.from(new Set(topics.flatMap(topicFilterStates))).map((state) => ({
        value: state,
        label: (locale === "vi" ? vi : en).marketplaceManager.states[
          state as keyof typeof en.marketplaceManager.states
        ],
      })),
    [locale, topics],
  );
  const topicMatches = useCallback(
    (topicId: string) =>
      topicMatchesFilters(
        topics.find((topic) => topic.id === topicId),
        topicGrades,
        topicSubjects,
        topicContests,
        topicStates,
      ),
    [topicContests, topicGrades, topicStates, topicSubjects, topics],
  );
  return {
    topicContestOptions,
    topicContests,
    topicGradeOptions,
    topicGrades,
    topicMatches,
    topicSubjectOptions,
    topicSubjects,
    topicStateOptions,
    topicStates,
    setTopicGrades,
    setTopicSubjects,
    setTopicContests,
    setTopicStates,
  };
}
