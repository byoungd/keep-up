import { afterEach, describe, expect, it, vi } from "vitest";
import { PersistenceQueue } from "../persistenceQueue";

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

describe("PersistenceQueue", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("retries and emits recovery events", async () => {
    vi.useFakeTimers();
    const emit = vi.fn();
    let attempts = 0;

    const queue = new PersistenceQueue({
      logger,
      emit,
      baseDelayMs: 10,
      maxDelayMs: 10,
      maxAttempts: 3,
    });

    queue.enqueue({
      kind: "session_state",
      meta: { sessionId: "session-1" },
      run: async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error("fail");
        }
      },
    });

    await vi.runAllTimersAsync();
    await queue.flush();

    expect(attempts).toBe(2);
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ status: "retry" }));
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ status: "recovered" }));
  });
});
