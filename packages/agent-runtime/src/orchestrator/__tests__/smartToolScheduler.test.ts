/**
 * Smart Tool Scheduler Tests
 */

import { describe, expect, it } from "vitest";

import type { MCPToolCall } from "../../types";
import { SmartToolScheduler } from "../smartToolScheduler";

const createCall = (name: string): MCPToolCall => ({
  name,
  arguments: {},
});

describe("SmartToolScheduler", () => {
  it("reduces concurrency for slow tool groups", () => {
    const scheduler = new SmartToolScheduler({
      config: { adaptiveConcurrency: true, targetLatencyMs: 1000 },
    });

    const calls = [createCall("bash:execute"), createCall("bash:execute")];
    const recommended = scheduler.recommendConcurrency(calls, 4);

    expect(recommended).toBeLessThan(4);
  });

  it("increases concurrency for fast tool groups", () => {
    const scheduler = new SmartToolScheduler({
      config: { adaptiveConcurrency: true, targetLatencyMs: 2000, maxConcurrencyScale: 1.5 },
    });

    const calls = [createCall("file:read"), createCall("file:read")];
    const recommended = scheduler.recommendConcurrency(calls, 2);

    expect(recommended).toBe(2);
  });
});
