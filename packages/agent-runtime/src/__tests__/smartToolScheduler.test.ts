import { describe, expect, it } from "vitest";
import { SmartToolScheduler } from "../orchestrator/smartToolScheduler";
import type { MCPToolCall } from "../types";

function makeCall(name: string, args: Record<string, unknown> = {}): MCPToolCall {
  return {
    id: `${name}-${Math.random()}`,
    name,
    arguments: args,
  };
}

describe("SmartToolScheduler", () => {
  it("respects network concurrency limits while sorting fast tools first", () => {
    const scheduler = new SmartToolScheduler({
      config: { maxNetworkConcurrent: 1, maxCpuConcurrent: 2, maxDefaultConcurrent: 2 },
    });

    const calls = [
      makeCall("web:search", { query: "a" }),
      makeCall("file:read", { path: "/tmp/a" }),
      makeCall("web:fetch", { url: "https://example.com" }),
    ];

    const schedule = scheduler.schedule(calls);
    expect(schedule).toHaveLength(2);
    expect(schedule[0].map((call) => call.name)).toEqual(["file:read", "web:fetch"]);
    expect(schedule[1].map((call) => call.name)).toEqual(["web:search"]);
  });

  it("isolates non-parallelizable tools", () => {
    const scheduler = new SmartToolScheduler({
      config: { maxNetworkConcurrent: 2, maxCpuConcurrent: 2, maxDefaultConcurrent: 2 },
    });

    const calls = [makeCall("file:read", { path: "/tmp/a" }), makeCall("bash:execute")];
    const schedule = scheduler.schedule(calls);

    expect(schedule).toHaveLength(2);
    expect(schedule[0].map((call) => call.name)).toEqual(["file:read"]);
    expect(schedule[1].map((call) => call.name)).toEqual(["bash:execute"]);
  });

  it("serializes conflicting resource writes", () => {
    const scheduler = new SmartToolScheduler({
      config: { maxNetworkConcurrent: 2, maxCpuConcurrent: 2, maxDefaultConcurrent: 2 },
    });

    const calls = [
      makeCall("file:write", { path: "/tmp/shared.txt", content: "a" }),
      makeCall("file:write", { path: "/tmp/shared.txt", content: "b" }),
    ];

    const schedule = scheduler.schedule(calls);
    expect(schedule).toHaveLength(2);
    expect(schedule[0]).toHaveLength(1);
    expect(schedule[1]).toHaveLength(1);
  });

  it("serializes moves that share source or destination", () => {
    const scheduler = new SmartToolScheduler({
      config: { maxNetworkConcurrent: 2, maxCpuConcurrent: 2, maxDefaultConcurrent: 2 },
    });

    const calls = [
      makeCall("file:move", { srcPath: "/tmp/a", destPath: "/tmp/b" }),
      makeCall("file:move", { from: "/tmp/a", to: "/tmp/c" }),
    ];

    const schedule = scheduler.schedule(calls);
    expect(schedule).toHaveLength(2);
    expect(schedule[0]).toHaveLength(1);
    expect(schedule[1]).toHaveLength(1);
  });

  it("reduces concurrency after rate limit failures", () => {
    const scheduler = new SmartToolScheduler({
      config: { adaptiveConcurrency: true, targetLatencyMs: 1500 },
    });

    const calls = [
      makeCall("web:search", { query: "a" }),
      makeCall("web:search", { query: "b" }),
      makeCall("web:search", { query: "c" }),
    ];

    const baseline = scheduler.recommendConcurrency(calls, 4);
    scheduler.recordResult("web:search", 1200, { success: false, errorCode: "RATE_LIMITED" });
    scheduler.recordResult("web:search", 1200, { success: false, errorCode: "RATE_LIMITED" });
    const reduced = scheduler.recommendConcurrency(calls, 4);

    expect(reduced).toBeLessThan(baseline);
  });
});
