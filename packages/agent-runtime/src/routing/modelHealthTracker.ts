/**
 * Model Health Tracker
 *
 * Tracks error rates, timeouts, and latency for health-aware routing.
 */

export type ModelHealthStatus = "healthy" | "degraded" | "unhealthy";

export interface ModelHealthThresholds {
  degraded: number;
  unhealthy: number;
}

export interface ModelHealthConfig {
  errorRate?: ModelHealthThresholds;
  timeoutRate?: ModelHealthThresholds;
  latencyMs?: ModelHealthThresholds;
  sampleAlpha?: number;
  decayHalfLifeMs?: number;
  minSampleCount?: number;
}

export interface ModelHealthObservation {
  modelId: string;
  outcome: "success" | "error" | "timeout";
  latencyMs?: number;
  timestamp?: number;
}

export interface ModelHealthSnapshot {
  modelId: string;
  errorRate: number;
  timeoutRate: number;
  latencyMs: number;
  status: ModelHealthStatus;
  updatedAt: number;
  sampleCount: number;
}

type ModelHealthRecord = {
  errorRate: number;
  timeoutRate: number;
  latencyMs: number;
  lastUpdated: number;
  sampleCount: number;
};

const DEFAULT_THRESHOLDS = {
  errorRate: { degraded: 0.1, unhealthy: 0.3 },
  timeoutRate: { degraded: 0.05, unhealthy: 0.2 },
  latencyMs: { degraded: 2000, unhealthy: 5000 },
};

const DEFAULT_ALPHA = 0.3;
const DEFAULT_DECAY_HALF_LIFE_MS = 5 * 60 * 1000;
const DEFAULT_MIN_SAMPLE_COUNT = 3;

export class ModelHealthTracker {
  private readonly records = new Map<string, ModelHealthRecord>();
  private readonly thresholds: {
    errorRate: ModelHealthThresholds;
    timeoutRate: ModelHealthThresholds;
    latencyMs: ModelHealthThresholds;
  };
  private readonly sampleAlpha: number;
  private readonly decayHalfLifeMs: number;
  private readonly minSampleCount: number;

  constructor(config: ModelHealthConfig = {}) {
    this.thresholds = {
      errorRate: config.errorRate ?? DEFAULT_THRESHOLDS.errorRate,
      timeoutRate: config.timeoutRate ?? DEFAULT_THRESHOLDS.timeoutRate,
      latencyMs: config.latencyMs ?? DEFAULT_THRESHOLDS.latencyMs,
    };
    this.sampleAlpha = config.sampleAlpha ?? DEFAULT_ALPHA;
    this.decayHalfLifeMs = config.decayHalfLifeMs ?? DEFAULT_DECAY_HALF_LIFE_MS;
    this.minSampleCount = config.minSampleCount ?? DEFAULT_MIN_SAMPLE_COUNT;
  }

  recordObservation(observation: ModelHealthObservation): ModelHealthSnapshot {
    const now = observation.timestamp ?? Date.now();
    const record = this.records.get(observation.modelId) ?? {
      errorRate: 0,
      timeoutRate: 0,
      latencyMs: 0,
      lastUpdated: now,
      sampleCount: 0,
    };

    this.applyDecay(record, now);

    const errorValue = observation.outcome === "error" ? 1 : 0;
    const timeoutValue = observation.outcome === "timeout" ? 1 : 0;

    record.errorRate = this.updateEwma(record.errorRate, errorValue);
    record.timeoutRate = this.updateEwma(record.timeoutRate, timeoutValue);

    if (typeof observation.latencyMs === "number") {
      record.latencyMs = this.updateEwma(record.latencyMs, observation.latencyMs);
    }

    record.sampleCount += 1;
    record.lastUpdated = now;
    this.records.set(observation.modelId, record);

    return this.toSnapshot(observation.modelId, record);
  }

  getHealth(modelId: string): ModelHealthSnapshot | undefined {
    const record = this.records.get(modelId);
    if (!record) {
      return undefined;
    }
    this.applyDecay(record, Date.now());
    return this.toSnapshot(modelId, record);
  }

  getStatus(modelId: string): ModelHealthStatus | undefined {
    return this.getHealth(modelId)?.status;
  }

  reset(modelId?: string): void {
    if (modelId) {
      this.records.delete(modelId);
      return;
    }
    this.records.clear();
  }

  private applyDecay(record: ModelHealthRecord, now: number): void {
    if (this.decayHalfLifeMs <= 0) {
      return;
    }
    const elapsedMs = now - record.lastUpdated;
    if (elapsedMs <= 0) {
      return;
    }
    const decayFactor = Math.exp((-Math.log(2) * elapsedMs) / this.decayHalfLifeMs);
    record.errorRate *= decayFactor;
    record.timeoutRate *= decayFactor;
    record.latencyMs *= decayFactor;
    record.lastUpdated = now;
  }

  private updateEwma(current: number, value: number): number {
    return current * (1 - this.sampleAlpha) + value * this.sampleAlpha;
  }

  private toSnapshot(modelId: string, record: ModelHealthRecord): ModelHealthSnapshot {
    return {
      modelId,
      errorRate: record.errorRate,
      timeoutRate: record.timeoutRate,
      latencyMs: record.latencyMs,
      status: this.computeStatus(record),
      updatedAt: record.lastUpdated,
      sampleCount: record.sampleCount,
    };
  }

  private computeStatus(record: ModelHealthRecord): ModelHealthStatus {
    if (record.sampleCount < this.minSampleCount) {
      return "healthy";
    }

    const errorStatus = this.classifyMetric(record.errorRate, this.thresholds.errorRate);
    const timeoutStatus = this.classifyMetric(record.timeoutRate, this.thresholds.timeoutRate);
    const latencyStatus = this.classifyMetric(record.latencyMs, this.thresholds.latencyMs);

    if (
      errorStatus === "unhealthy" ||
      timeoutStatus === "unhealthy" ||
      latencyStatus === "unhealthy"
    ) {
      return "unhealthy";
    }

    if (
      errorStatus === "degraded" ||
      timeoutStatus === "degraded" ||
      latencyStatus === "degraded"
    ) {
      return "degraded";
    }

    return "healthy";
  }

  private classifyMetric(value: number, thresholds: ModelHealthThresholds): ModelHealthStatus {
    if (value >= thresholds.unhealthy) {
      return "unhealthy";
    }
    if (value >= thresholds.degraded) {
      return "degraded";
    }
    return "healthy";
  }
}

export function createModelHealthTracker(config?: ModelHealthConfig): ModelHealthTracker {
  return new ModelHealthTracker(config);
}
