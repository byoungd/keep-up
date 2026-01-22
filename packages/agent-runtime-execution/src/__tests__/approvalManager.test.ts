import { describe, expect, it, vi } from "vitest";
import { ApprovalManager } from "../security/approvalManager";

describe("ApprovalManager", () => {
  it("records approved decisions", async () => {
    const manager = new ApprovalManager();
    const decision = await manager.request("tool", { tool: "bash" }, async () => true);
    expect(decision.approved).toBe(true);
    expect(decision.status).toBe("approved");
  });

  it("records rejected decisions", async () => {
    const manager = new ApprovalManager();
    const decision = await manager.request("tool", { tool: "bash" }, async () => false);
    expect(decision.approved).toBe(false);
    expect(decision.status).toBe("rejected");
  });

  it("expires when handler times out", async () => {
    vi.useFakeTimers();
    const manager = new ApprovalManager();
    const decisionPromise = manager.request(
      "tool",
      { tool: "bash" },
      async () => new Promise(() => undefined),
      { timeoutMs: 10 }
    );

    vi.advanceTimersByTime(20);
    const decision = await decisionPromise;
    expect(decision.status).toBe("expired");
    expect(decision.approved).toBe(false);
    vi.useRealTimers();
  });
});
