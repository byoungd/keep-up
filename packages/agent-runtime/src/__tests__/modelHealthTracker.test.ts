/**
 * Model Health Tracker Tests
 */

import { describe, expect, it } from "vitest";
import { createModelHealthTracker } from "../routing/modelHealthTracker";

describe("ModelHealthTracker", () => {
  it("recovers after successful observations", () => {
    const tracker = createModelHealthTracker({
      errorRate: { degraded: 0.2, unhealthy: 0.5 },
      timeoutRate: { degraded: 0.2, unhealthy: 0.5 },
      latencyMs: { degraded: 1000, unhealthy: 2000 },
      sampleAlpha: 0.5,
      decayHalfLifeMs: 0,
      minSampleCount: 1,
    });

    tracker.recordObservation({
      modelId: "model-a",
      outcome: "error",
      latencyMs: 900,
    });

    expect(tracker.getHealth("model-a")?.status).toBe("unhealthy");

    tracker.recordObservation({
      modelId: "model-a",
      outcome: "success",
      latencyMs: 100,
    });
    tracker.recordObservation({
      modelId: "model-a",
      outcome: "success",
      latencyMs: 100,
    });

    expect(tracker.getHealth("model-a")?.status).toBe("healthy");
  });

  it("tracks latency and timeout health signals", () => {
    const tracker = createModelHealthTracker({
      errorRate: { degraded: 0.9, unhealthy: 0.95 },
      timeoutRate: { degraded: 0.2, unhealthy: 0.4 },
      latencyMs: { degraded: 200, unhealthy: 400 },
      sampleAlpha: 1,
      decayHalfLifeMs: 0,
      minSampleCount: 1,
    });

    tracker.recordObservation({
      modelId: "model-latency",
      outcome: "success",
      latencyMs: 300,
    });

    expect(tracker.getHealth("model-latency")?.status).toBe("degraded");

    tracker.recordObservation({
      modelId: "model-timeout",
      outcome: "timeout",
    });

    expect(tracker.getHealth("model-timeout")?.status).toBe("unhealthy");
  });
});
