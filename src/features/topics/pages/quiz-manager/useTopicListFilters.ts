import { useCallback, useMemo, useState } from "react";
import type { ContentV2TopicSummary } from "../../../../shared/domain/models";
import en from "../../../../shared/localization/en.json";
import vi from "../../../../shared/localization/vi.json";
import {
  topicFilterGrades,
  topicMatchesFilters,
} from "../../domain/topic-list-filters";

export function useTopicListFilters(
  topics: ContentV2TopicSummary[],
  locale: "en" | "vi",
) {
  const [topicGrades, setTopicGrades] = useState<string[]>([]);
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
  const topicMatches = useCallback(
    (topicId: string) =>
      topicMatchesFilters(
        topics.find((topic) => topic.id === topicId),
        topicGrades,
        [],
        [],
        [],
      ),
    [topicGrades, topics],
  );
  return {
    topicGradeOptions,
    topicGrades,
    topicMatches,
    setTopicGrades,
  };
}
