export const RECENT_ACTIVITY_STORAGE_KEY = "getgo-tools.topic-recent-activity.v1";

export type TopicRecentActivity = {
  version: 1;
  topics: Record<string, number>;
  quizzes: Record<string, number>;
  questions: Record<string, number>;
};

export type RecentActivityTarget = {
  topicId: string;
  quizId?: string;
  questionNo?: string | number;
};

export const emptyRecentActivity = (): TopicRecentActivity => ({
  version: 1,
  topics: {},
  quizzes: {},
  questions: {},
});

export const quizActivityKey = (topicId: string, quizId: string) =>
  `${topicId}/${quizId}`;

export const questionActivityKey = (
  topicId: string,
  quizId: string,
  questionNo: string | number,
) => `${quizActivityKey(topicId, quizId)}/${String(questionNo)}`;

function validTimestamps(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, number] =>
        typeof entry[1] === "number" && Number.isFinite(entry[1]),
    ),
  );
}

export function parseRecentActivity(value: string | null): TopicRecentActivity {
  if (!value) return emptyRecentActivity();
  try {
    const parsed = JSON.parse(value) as Partial<TopicRecentActivity>;
    return {
      version: 1,
      topics: validTimestamps(parsed.topics),
      quizzes: validTimestamps(parsed.quizzes),
      questions: validTimestamps(parsed.questions),
    };
  } catch {
    return emptyRecentActivity();
  }
}

export function loadRecentActivity(
  storage: Pick<Storage, "getItem"> = localStorage,
): TopicRecentActivity {
  try {
    return parseRecentActivity(storage.getItem(RECENT_ACTIVITY_STORAGE_KEY));
  } catch {
    return emptyRecentActivity();
  }
}

export function saveRecentActivity(
  activity: TopicRecentActivity,
  storage: Pick<Storage, "setItem"> = localStorage,
): void {
  try {
    storage.setItem(RECENT_ACTIVITY_STORAGE_KEY, JSON.stringify(activity));
  } catch {
    // Recent ordering is optional and must not block repository navigation.
  }
}

export function recordRecentActivity(
  current: TopicRecentActivity,
  target: RecentActivityTarget,
  timestamp = Date.now(),
): TopicRecentActivity {
  const next: TopicRecentActivity = {
    version: 1,
    topics: { ...current.topics, [target.topicId]: timestamp },
    quizzes: { ...current.quizzes },
    questions: { ...current.questions },
  };
  if (!target.quizId) return next;
  next.quizzes[quizActivityKey(target.topicId, target.quizId)] = timestamp;
  if (target.questionNo !== undefined)
    next.questions[
      questionActivityKey(target.topicId, target.quizId, target.questionNo)
    ] = timestamp;
  return next;
}

export function orderByRecent<T>(
  values: readonly T[],
  timestamps: Record<string, number>,
  key: (value: T) => string,
): T[] {
  return values
    .map((value, index) => ({ value, index }))
    .sort((left, right) =>
      (timestamps[key(right.value)] ?? 0) -
        (timestamps[key(left.value)] ?? 0) ||
      left.index - right.index,
    )
    .map(({ value }) => value);
}
