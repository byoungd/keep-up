/**
 * Graph Runtime Tests
 */

import { createEventBus, type RuntimeEvent } from "@ku0/agent-runtime-control";
import { describe, expect, it } from "vitest";
import { createCheckpointManager } from "../checkpoint";
import {
  arrayAppendReducer,
  createGraphBuilder,
  createGraphNodeCache,
  GraphRunner,
  replaceReducer,
  sumReducer,
} from "../graph";

const createIdFactory = () => {
  let index = 0;
  return () => `node-${++index}`;
};

describe("GraphRunner", () => {
  it("executes nodes based on channel updates", async () => {
    const builder = createGraphBuilder({ idFactory: createIdFactory() });
    const count = builder.createChannel<number>("count", { reducer: sumReducer });
    const log = builder.createChannel<number[]>("log", { reducer: arrayAppendReducer });

    builder.addNode({
      name: "seed",
      reads: [],
      writes: [count],
      run: async (context) => {
        context.write(count, 1);
        return { status: "completed" };
      },
    });

    builder.addNode({
      name: "logger",
      reads: [count],
      writes: [log],
      run: async (context) => {
        const value = context.read(count) ?? 0;
        context.write(log, [value]);
        return { status: "completed" };
      },
    });

    const graph = builder.build();
    const runner = new GraphRunner({ graph, maxIterations: 2 });
    const result = await runner.run();

    expect(result.status).toBe("completed");
    expect(result.channels.count).toBe(1);
    expect(result.channels.log).toEqual([1]);
  });

  it("retries nodes with backoff and succeeds", async () => {
    const eventBus = createEventBus();
    const retries: Array<RuntimeEvent<{ nodeId: string }>> = [];
    eventBus.subscribe("graph:retry", (event) => retries.push(event));

    const builder = createGraphBuilder({ idFactory: createIdFactory() });
    const output = builder.createChannel<string>("output", { reducer: replaceReducer });

    let attempts = 0;
    builder.addNode({
      name: "flaky",
      reads: [],
      writes: [output],
      retryPolicy: { maxRetries: 2, initialDelayMs: 0 },
      run: async (context) => {
        attempts += 1;
        if (attempts < 3) {
          throw new Error("transient failure");
        }
        context.write(output, "ok");
        return { status: "completed" };
      },
    });

    const graph = builder.build();
    const runner = new GraphRunner({ graph, eventBus, maxIterations: 1 });
    const result = await runner.run();

    const nodeState = result.nodeStates.find((state) => state.id.startsWith("node-"));
    expect(result.status).toBe("completed");
    expect(attempts).toBe(3);
    expect(nodeState?.attempts).toBe(3);
    expect(result.channels.output).toBe("ok");
    expect(retries).toHaveLength(2);
  });

  it("uses cached writes across runs", async () => {
    const eventBus = createEventBus();
    const cacheHits: Array<RuntimeEvent<{ nodeId: string }>> = [];
    eventBus.subscribe("graph:cache_hit", (event) => cacheHits.push(event));

    const cache = createGraphNodeCache();
    const builder = createGraphBuilder({ idFactory: createIdFactory() });
    const input = builder.createChannel<number>("input", { reducer: replaceReducer, initial: 2 });
    const output = builder.createChannel<number>("output", { reducer: replaceReducer });

    builder.addNode({
      name: "double",
      reads: [input],
      writes: [output],
      cachePolicy: {
        getKey: (inputs) => `double:${inputs.input}`,
      },
      run: async (context) => {
        const value = context.read(input) ?? 0;
        context.write(output, value * 2);
        return { status: "completed" };
      },
    });

    const graph = builder.build();
    const runner = new GraphRunner({ graph, cache, eventBus, maxIterations: 1 });
    const first = await runner.run();

    const secondRunner = new GraphRunner({ graph, cache, eventBus, maxIterations: 1 });
    const second = await secondRunner.run();

    expect(first.channels.output).toBe(4);
    expect(second.channels.output).toBe(4);
    expect(second.nodeStates[0]?.status).toBe("skipped");
    expect(cacheHits.length).toBeGreaterThanOrEqual(1);
  });

  it("resumes from checkpoint metadata", async () => {
    const manager = createCheckpointManager();
    const builder = createGraphBuilder({ idFactory: createIdFactory() });
    const input = builder.createChannel<number>("input", { reducer: replaceReducer, initial: 3 });
    const output = builder.createChannel<number>("output", { reducer: replaceReducer });

    builder.addNode({
      name: "triple",
      reads: [input],
      writes: [output],
      run: async (context) => {
        const value = context.read(input) ?? 0;
        context.write(output, value * 3);
        return { status: "completed" };
      },
    });

    const graph = builder.build();
    const runner = new GraphRunner({
      graph,
      maxIterations: 1,
      checkpoint: {
        manager,
        create: {
          task: "graph-run",
          agentType: "graph",
          agentId: "runner",
        },
      },
    });

    const first = await runner.run();
    expect(first.channels.output).toBe(9);
    const checkpointId = first.checkpointId;
    expect(checkpointId).toBeDefined();
    if (!checkpointId) {
      throw new Error("Expected checkpointId to be defined");
    }

    const checkpoint = await manager.load(checkpointId);
    expect(checkpoint?.metadata.graph).toBeDefined();

    const resumed = new GraphRunner({
      graph,
      maxIterations: 1,
      checkpoint: {
        manager,
        checkpointId: first.checkpointId,
        resume: true,
      },
    });

    const second = await resumed.run();
    expect(second.channels.output).toBe(9);
    expect(second.status).toBe("completed");
  });
});
