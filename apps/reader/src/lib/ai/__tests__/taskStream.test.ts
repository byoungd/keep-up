import { describe, expect, it } from "vitest";
import { parseTaskStreamEvent } from "../taskStream";

describe("parseTaskStreamEvent", () => {
  it("parses task stream events from SSE payloads", () => {
    const payload = JSON.stringify({
      event: {
        type: "task.running",
        taskId: "task-1",
        timestamp: Date.now(),
        data: { progress: 10 },
      },
    });

    const result = parseTaskStreamEvent(payload);

    expect(result?.type).toBe("task.running");
  });

  it("returns null for invalid payloads", () => {
    expect(parseTaskStreamEvent("not-json")).toBeNull();
  });
});
