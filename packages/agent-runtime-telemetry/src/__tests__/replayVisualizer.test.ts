import { describe, expect, it } from "vitest";
import { ReplayVisualizer } from "../replay/visualizer";

describe("ReplayVisualizer", () => {
  it("builds a replay timeline", () => {
    const visualizer = new ReplayVisualizer();
    const timeline = visualizer.buildTimeline([
      { checkpointId: "c1", timestamp: 100, state: { value: 1 } },
      { checkpointId: "c2", timestamp: 200, state: { value: 2 } },
    ]);

    expect(timeline.checkpointCount).toBe(2);
    expect(timeline.durationMs).toBe(100);
  });
});
