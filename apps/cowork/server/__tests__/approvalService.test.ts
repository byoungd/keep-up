import { describe, expect, it, vi } from "vitest";
import { ApprovalService } from "../services/approvalService";

describe("ApprovalService", () => {
  it("resolves pending approvals", async () => {
    const service = new ApprovalService({ defaultTimeoutMs: 1000 });
    const pending = service.waitForDecision("approval-1");

    expect(service.resolveApproval("approval-1", "approved")).toBe(true);
    await expect(pending).resolves.toBe("approved");
  });

  it("returns resolved approvals that arrive before waiting", async () => {
    const service = new ApprovalService({ defaultTimeoutMs: 1000 });
    expect(service.resolveApproval("approval-2", "rejected")).toBe(false);

    await expect(service.waitForDecision("approval-2")).resolves.toBe("rejected");
  });

  it("times out to rejected", async () => {
    vi.useFakeTimers();
    const service = new ApprovalService({ defaultTimeoutMs: 50 });
    const pending = service.waitForDecision("approval-3");

    vi.advanceTimersByTime(60);
    await expect(pending).resolves.toBe("rejected");
    vi.useRealTimers();
  });
});
