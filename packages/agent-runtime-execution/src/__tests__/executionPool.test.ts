/**
 * Execution Pool Tests
 */

import { describe, expect, it } from "vitest";
import type { ExecutionTaskHandler } from "../execution";
import { ExecutionPool, InMemoryExecutionStateStore } from "../execution";

interface TestClock {
  now: () => number;
  advance: (ms: number) => void;
}

function createClock(start = 0): TestClock {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

function createDeferred<T>() {
  let resolve: ((value: T) => void) | undefined;
  let reject: ((reason?: unknown) => void) | undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  if (!resolve || !reject) {
    throw new Error("Deferred initialization failed.");
  }
  return { promise, resolve, reject };
}

function createPool(
  options: {
    clock?: TestClock;
    execution?: ConstructorParameters<typeof ExecutionPool>[0]["execution"];
    store?: InMemoryExecutionStateStore;
  } = {}
) {
  const clock = options.clock ?? createClock();
  const store = options.store ?? new InMemoryExecutionStateStore();
  const pool = new ExecutionPool({
    execution: options.execution,
    now: clock.now,
    stateStore: store,
  });
  return { pool, clock, store };
}

describe("execution pool", () => {
  it("assigns tasks to least inFlight then oldest lastSeenAt", async () => {
    const { pool, clock } = createPool({
      execution: { leaseTtlMs: 1000, maxInFlightPerWorker: 1 },
    });
    const deferred = createDeferred<void>();

    pool.registerTaskHandler("noop", {
      execute: async () => deferred.promise,
    });

    pool.registerWorker("worker-a", 1);
    pool.registerWorker("worker-b", 1);

    clock.advance(50);
    await pool.heartbeatWorker("worker-b");

    const first = await pool.submitTask({ type: "noop", payload: {} });
    const second = await pool.submitTask({ type: "noop", payload: {} });

    await pool.tick();

    const task1 = pool.getTask(first.taskId);
    const task2 = pool.getTask(second.taskId);

    expect(task1?.workerId).toBe("worker-a");
    expect(task2?.workerId).toBe("worker-b");

    deferred.resolve();
  });

  it("honors priority lanes", async () => {
    const { pool } = createPool({ execution: { maxInFlightPerWorker: 1, leaseTtlMs: 1000 } });
    const deferred = createDeferred<void>();

    pool.registerTaskHandler("noop", {
      execute: async () => deferred.promise,
    });
    pool.registerWorker("worker-1", 1);

    const batch = await pool.submitTask({ type: "noop", payload: {}, queueClass: "batch" });
    const normal = await pool.submitTask({ type: "noop", payload: {}, queueClass: "normal" });
    const interactive = await pool.submitTask({
      type: "noop",
      payload: {},
      queueClass: "interactive",
    });

    await pool.tick();

    expect(pool.getTask(interactive.taskId)?.status).toBe("running");
    expect(pool.getTask(normal.taskId)?.status).toBe("queued");
    expect(pool.getTask(batch.taskId)?.status).toBe("queued");

    deferred.resolve();
  });

  it("rejects batch submissions when backpressure threshold exceeded", async () => {
    const { pool } = createPool({
      execution: { queueDepthLimit: 10, batchBackpressureThreshold: 2 },
    });

    pool.registerTaskHandler("noop", {
      execute: async () => undefined,
    });

    await pool.submitTask({ type: "noop", payload: {} });
    await pool.submitTask({ type: "noop", payload: {} });

    const receipt = await pool.submitTask({ type: "noop", payload: {}, queueClass: "batch" });
    expect(receipt.accepted).toBe(false);
    expect(receipt.reason).toBe("backpressure");
  });

  it("rejects submissions when queue depth limit is hit", async () => {
    const { pool } = createPool({ execution: { queueDepthLimit: 2 } });

    pool.registerTaskHandler("noop", {
      execute: async () => undefined,
    });

    await pool.submitTask({ type: "noop", payload: {} });
    await pool.submitTask({ type: "noop", payload: {} });

    const receipt = await pool.submitTask({ type: "noop", payload: {} });
    expect(receipt.accepted).toBe(false);
    expect(receipt.reason).toBe("queue_full");
  });

  it("refreshes lease expiration on heartbeat", async () => {
    const clock = createClock();
    const store = new InMemoryExecutionStateStore();
    const { pool } = createPool({
      clock,
      store,
      execution: { leaseTtlMs: 100, maxInFlightPerWorker: 1 },
    });

    const deferred = createDeferred<void>();
    pool.registerTaskHandler("noop", {
      execute: async () => deferred.promise,
    });
    pool.registerWorker("worker-1", 1);

    const receipt = await pool.submitTask({ type: "noop", payload: {} });
    await pool.tick();

    const before = (await store.listLeases())[0];
    clock.advance(50);
    await pool.heartbeatWorker("worker-1");
    const after = (await store.listLeases())[0];

    expect(after.expiresAt).toBeGreaterThan(before.expiresAt);

    deferred.resolve();
    await pool.waitForTask(receipt.taskId);
  });

  it("requeues expired leases with attempt increment", async () => {
    const clock = createClock();
    const { pool } = createPool({
      clock,
      execution: { leaseTtlMs: 10, maxInFlightPerWorker: 1 },
    });
    const deferred = createDeferred<void>();

    pool.registerTaskHandler("noop", {
      execute: async () => deferred.promise,
    });
    pool.registerWorker("worker-1", 1);

    const receipt = await pool.submitTask({ type: "noop", payload: {} });
    await pool.tick();

    pool.setWorkerState("worker-1", "draining");
    clock.advance(20);
    await pool.tick();

    const task = pool.getTask(receipt.taskId);
    expect(task?.status).toBe("queued");
    expect(task?.attempt).toBe(1);
  });

  it("invokes cleanup on cancellation", async () => {
    const { pool } = createPool({ execution: { leaseTtlMs: 100, maxInFlightPerWorker: 1 } });
    let cleaned = false;

    const handler: ExecutionTaskHandler = {
      execute: async (_payload, context) => {
        return new Promise((_, reject) => {
          context.signal.addEventListener("abort", () => reject(new Error("aborted")));
        });
      },
      cleanup: () => {
        cleaned = true;
      },
    };

    pool.registerTaskHandler("noop", handler);
    pool.registerWorker("worker-1", 1);

    const receipt = await pool.submitTask({ type: "noop", payload: {} });
    await pool.tick();

    const cancelled = await pool.cancelTask(receipt.taskId);
    expect(cancelled).toBe(true);
    expect(cleaned).toBe(true);
    expect(pool.getTask(receipt.taskId)?.status).toBe("canceled");
  });

  it("defers tasks that exceed quota limits", async () => {
    const { pool } = createPool({
      execution: {
        leaseTtlMs: 1000,
        maxInFlightPerWorker: 2,
        quotaConfig: { models: { "gpt-test": { maxInFlight: 1 } } },
      },
    });
    const deferred = createDeferred<void>();

    pool.registerTaskHandler("noop", {
      execute: async () => deferred.promise,
    });
    pool.registerWorker("worker-1", 2);

    const first = await pool.submitTask({ type: "noop", payload: {}, modelId: "gpt-test" });
    const second = await pool.submitTask({ type: "noop", payload: {}, modelId: "gpt-test" });

    await pool.tick();

    expect(pool.getTask(first.taskId)?.status).toBe("running");
    expect(pool.getTask(second.taskId)?.status).toBe("queued");

    deferred.resolve();
    await pool.waitForTask(first.taskId);
    await pool.waitForTask(second.taskId);

    expect(pool.getTask(second.taskId)?.status).toBe("completed");
  });

  it("persists task snapshots at boundaries", async () => {
    const store = new InMemoryExecutionStateStore();
    const { pool } = createPool({ store, execution: { maxInFlightPerWorker: 1 } });

    pool.registerTaskHandler("noop", {
      execute: async () => "ok",
    });
    pool.registerWorker("worker-1", 1);

    const receipt = await pool.submitTask({ type: "noop", payload: {} });
    await pool.tick();
    await pool.waitForTask(receipt.taskId);

    const snapshots = await store.listTaskSnapshots({ taskId: receipt.taskId });
    const statuses = snapshots.map((snapshot) => snapshot.status);

    expect(statuses).toContain("queued");
    expect(statuses).toContain("running");
    expect(statuses).toContain("completed");
  });

  it("replays queued tasks on recovery", async () => {
    const store = new InMemoryExecutionStateStore();
    const { pool } = createPool({ store, execution: { maxInFlightPerWorker: 1 } });
    const deferred = createDeferred<void>();

    pool.registerTaskHandler("noop", {
      execute: async () => deferred.promise,
    });
    pool.registerWorker("worker-1", 1);

    const receipt = await pool.submitTask({ type: "noop", payload: {} });
    await pool.tick();

    const recovered = new ExecutionPool({
      execution: { maxInFlightPerWorker: 1 },
      now: createClock().now,
      stateStore: store,
    });
    recovered.registerTaskHandler("noop", {
      execute: async () => "ok",
    });

    await recovered.recoverFromStore();

    const recoveredTask = recovered.getTask(receipt.taskId);
    expect(recoveredTask?.status).toBe("queued");
    expect(recoveredTask?.attempt).toBe(1);

    deferred.resolve();
  });
});
