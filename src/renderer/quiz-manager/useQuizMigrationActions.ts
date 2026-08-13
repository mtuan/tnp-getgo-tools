import type { ContestSummary, QuizMigrationResult, QuizSummary } from "../../core/models";

type MigrationContext = Record<string, any> & {
  contests: Array<ContestSummary & { quizzes: QuizSummary[] }>;
};

export function useQuizMigrationActions(context: MigrationContext) {
  const {
    allLegacyQuizCount,
    buttonAction,
    contests,
    legacyQuizCount,
    managerApi,
    onSnapshotChange,
    selectedContest,
    setButtonAction,
    setMigrationResults,
    snapshot,
    toast,
  } = context;
  async function runButtonAction(key: string, action: () => Promise<void>) {
    if (buttonAction) return;
    setButtonAction(key);
    try {
      await action();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      toast.show({
        title: "Operation failed",
        description: message,
        variant: "error",
      });
    } finally {
      setButtonAction(null);
    }
  }

  async function migrateLegacyQuizzes() {
    if (
      !selectedContest ||
      !legacyQuizCount ||
      !window.confirm(
        `Migrate ${legacyQuizCount} legacy quiz${legacyQuizCount === 1 ? "" : "zes"}? Questions will be extracted from raw.ts, falling back to raw.json. Existing source files will not be changed.`,
      )
    )
      return;
    await runButtonAction("migrate-legacy", async () => {
      const result = await managerApi.migrateLegacyQuizzes(selectedContest.id);
      onSnapshotChange(result.snapshot);
      if (result.failures.length) {
        const details = result.failures
          .map((failure: QuizMigrationResult["failures"][number]) => `${failure.quizId}: ${failure.message}`)
          .join("\n");
        console.error("[GetGo Tools][Quiz migration]", details);
        setMigrationResults({ result, attempted: legacyQuizCount });
        toast.show({
          title: `Migrated ${result.migratedQuizIds.length} of ${legacyQuizCount} quizzes`,
          description: `${result.failures.length} quiz${result.failures.length === 1 ? "" : "zes"} failed. See migration results for details.`,
          variant: "error",
        });
        return;
      }
      toast.show({
        title: `${result.migratedQuizIds.length} quiz${result.migratedQuizIds.length === 1 ? "" : "zes"} migrated`,
        description:
          "Questions were extracted into the new questions folder structure.",
      });
    });
  }

  async function migrateAllLegacyQuizzes() {
    if (
      !allLegacyQuizCount ||
      !window.confirm(
        `Migrate all ${allLegacyQuizCount} legacy quizzes across every contest? Questions will be extracted from raw.ts, falling back to raw.json. Existing source files will not be changed.`,
      )
    )
      return;
    await runButtonAction("migrate-all-legacy", async () => {
      const migratedQuizIds: string[] = [];
      const failures: QuizMigrationResult["failures"] = [];
      let latestSnapshot = snapshot;
      for (const contest of contests) {
        const contestLegacyCount = contest.quizzes.filter(
          (quiz) => quiz.questionStorageVersion === "legacy",
        ).length;
        if (!contestLegacyCount) continue;
        try {
          const result = await managerApi.migrateLegacyQuizzes(contest.id);
          latestSnapshot = result.snapshot;
          migratedQuizIds.push(
            ...result.migratedQuizIds.map(
              (quizId: string) => `${contest.id}/${quizId}`,
            ),
          );
          failures.push(
            ...result.failures.map((failure: QuizMigrationResult["failures"][number]) => ({
              ...failure,
              quizId: `${contest.id}/${failure.quizId}`,
            })),
          );
        } catch (cause) {
          const message =
            cause instanceof Error ? cause.message : String(cause);
          failures.push(
            ...contest.quizzes
              .filter((quiz) => quiz.questionStorageVersion === "legacy")
              .map((quiz) => ({ quizId: `${contest.id}/${quiz.id}`, message })),
          );
        }
      }
      onSnapshotChange(latestSnapshot);
      const result: QuizMigrationResult = {
        snapshot: latestSnapshot,
        migratedQuizIds,
        failures,
      };
      if (failures.length) {
        console.error(
          "[GetGo Tools][All-contest quiz migration]",
          failures
            .map((failure) => `${failure.quizId}: ${failure.message}`)
            .join("\n"),
        );
        setMigrationResults({ result, attempted: allLegacyQuizCount });
        toast.show({
          title: `Migrated ${migratedQuizIds.length} of ${allLegacyQuizCount} quizzes`,
          description: `${failures.length} quiz${failures.length === 1 ? "" : "zes"} failed. See migration results for details.`,
          variant: "error",
        });
        return;
      }
      toast.show({
        title: `All ${migratedQuizIds.length} legacy quizzes migrated`,
        description: "Questions were extracted for every contest.",
      });
    });
  }

  return { runButtonAction, migrateLegacyQuizzes, migrateAllLegacyQuizzes };
}
