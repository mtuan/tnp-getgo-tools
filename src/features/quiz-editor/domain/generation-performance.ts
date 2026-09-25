export type GenerationSpeed = "fast" | "normal" | "slow";

export type GenerationPerformance = {
  durationMs: number;
  speed: GenerationSpeed;
};

export function generationSpeed(durationMs: number): GenerationSpeed {
  if (durationMs < 250) return "fast";
  if (durationMs < 1_000) return "normal";
  return "slow";
}

export function generationPerformance(durationMs: number): GenerationPerformance {
  const roundedDurationMs = durationMs < 100
    ? Math.round(durationMs * 10) / 10
    : Math.round(durationMs);
  return {
    durationMs: roundedDurationMs,
    speed: generationSpeed(roundedDurationMs),
  };
}
