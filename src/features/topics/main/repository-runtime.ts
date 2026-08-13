import path from "node:path";
import type { RepositorySnapshot } from "../../../shared/domain/models.js";
import {
  readQuizSummary,
  scanQuizRepository,
} from "../repository/quiz-repository.js";

export class RepositoryRuntime {
  private snapshotValue: RepositorySnapshot | null = null;
  private scanPromise: Promise<RepositorySnapshot> | null = null;
  private scanPath: string | null = null;

  snapshot(): RepositorySnapshot {
    if (!this.snapshotValue) {
      throw new Error(
        "Repository data is not loaded. Restart Tools or choose the repository again.",
      );
    }
    return this.snapshotValue;
  }

  replace(snapshot: RepositorySnapshot): RepositorySnapshot {
    this.snapshotValue = snapshot;
    return snapshot;
  }

  update(
    update: (snapshot: RepositorySnapshot) => RepositorySnapshot,
  ): RepositorySnapshot {
    return this.replace(update(this.snapshot()));
  }

  async scan(
    repositoryPath: string,
    options?: Parameters<typeof scanQuizRepository>[1],
    force = false,
  ): Promise<RepositorySnapshot> {
    const startedAt = Date.now();
    const resolved = path.resolve(repositoryPath);
    if (!force && this.snapshotValue?.repositoryPath === resolved) {
      console.info("[GetGo Tools][Repository index] Reused lightweight snapshot", {
        durationMs: Date.now() - startedAt,
      });
      return this.snapshotValue;
    }
    if (this.scanPromise) {
      if (!force && this.scanPath === resolved) return this.scanPromise;
      await this.scanPromise;
      return this.scan(resolved, options, force);
    }
    this.scanPath = resolved;
    this.scanPromise = this.performScan(resolved, options, startedAt);
    try {
      return await this.scanPromise;
    } finally {
      this.scanPromise = null;
      this.scanPath = null;
    }
  }

  async wait(repositoryPath: string): Promise<RepositorySnapshot> {
    const resolved = path.resolve(repositoryPath);
    if (this.snapshotValue?.repositoryPath === resolved) return this.snapshotValue;
    if (this.scanPromise && this.scanPath === resolved) {
      const snapshot = await this.scanPromise;
      if (snapshot.repositoryPath === resolved) return snapshot;
    }
    throw new Error(
      "Repository data is not loaded. Restart Tools or choose the repository again.",
    );
  }

  async replaceQuiz(root: string, manifestPath: string): Promise<RepositorySnapshot> {
    const quiz = await readQuizSummary(root, manifestPath);
    return this.update((snapshot) => ({
      ...snapshot,
      quizzes: [
        ...snapshot.quizzes.filter(
          (item) => item.manifestPath !== manifestPath && item.key !== quiz.key,
        ),
        quiz,
      ].sort((left, right) => left.key.localeCompare(right.key)),
    }));
  }

  private async performScan(
    repositoryPath: string,
    options: Parameters<typeof scanQuizRepository>[1] | undefined,
    startedAt: number,
  ): Promise<RepositorySnapshot> {
    const snapshot = await scanQuizRepository(repositoryPath, options);
    this.snapshotValue = snapshot;
    console.info("[GetGo Tools][Repository index] Snapshot ready", {
      contests: snapshot.contests.length,
      legacyQuizzes: snapshot.quizzes.length,
      contentV2Topics: snapshot.contentV2.topics.length,
      contentV2Quizzes: snapshot.contentV2.quizzes.length,
      contentV2Questions: snapshot.contentV2.questions.length,
      durationMs: Date.now() - startedAt,
    });
    return snapshot;
  }
}
