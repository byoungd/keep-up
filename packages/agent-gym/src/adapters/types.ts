import type { GymCategory, GymDifficulty, GymScenario } from "../types";

export interface ExternalBenchmarkLoadOptions {
  sourcePath: string;
  categories?: GymCategory[];
  difficulties?: GymDifficulty[];
  defaultCategory?: GymCategory;
  defaultDifficulty?: GymDifficulty;
  limit?: number;
  maxTurns?: number;
}

export interface ExternalBenchmarkAdapter {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  load(options: ExternalBenchmarkLoadOptions): Promise<GymScenario[]>;
}

export interface BenchmarkAdapterRegistry {
  get(id: string): ExternalBenchmarkAdapter | undefined;
  list(): ExternalBenchmarkAdapter[];
}
