export const marketplaceSyncAllJobName = "Sync marketplace · All topics";
export const marketplaceSyncTopicJobPrefix = "Sync marketplace topic · ";

const activeStatuses = new Set(["queued", "running", "paused"]);

export function marketplaceSyncTopicJobName(topicId: string): string {
  return `${marketplaceSyncTopicJobPrefix}${topicId}`;
}

export function isActiveMarketplaceSyncJob(job: {
  kind: string;
  name: string;
  status: string;
}): boolean {
  return (
    job.kind === "publish" &&
    (job.name === marketplaceSyncAllJobName ||
      job.name.startsWith(marketplaceSyncTopicJobPrefix)) &&
    activeStatuses.has(job.status)
  );
}
