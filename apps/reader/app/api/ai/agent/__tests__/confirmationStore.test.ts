import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPendingConfirmation, resolvePendingConfirmation } from "../confirmationStore";

describe("confirmationStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves pending confirmations", async () => {
    const { confirmationId, promise } = createPendingConfirmation({ requestId: "req-1" });
    const result = resolvePendingConfirmation({
      confirmationId,
      confirmed: true,
      requestId: "req-1",
    });

    expect(result.status).toBe("resolved");
    await expect(promise).resolves.toBe(true);
  });

  it("returns not_found for unknown confirmations", () => {
    const result = resolvePendingConfirmation({
      confirmationId: "missing",
      confirmed: false,
    });

    expect(result.status).toBe("not_found");
  });

  it("expires confirmations after the timeout", async () => {
    const { confirmationId, promise } = createPendingConfirmation({
      requestId: "req-2",
      timeoutMs: 25,
    });

    await vi.advanceTimersByTimeAsync(25);

    await expect(promise).resolves.toBe(false);
    const result = resolvePendingConfirmation({
      confirmationId,
      confirmed: true,
      requestId: "req-2",
    });

    expect(result.status).toBe("not_found");
  });
});
