# Graph Runtime (v1)

Status: Implemented  
Owner: Agent Runtime  
Last Updated: 2026-02-15  
Applies to: Agent Runtime v1  
Related docs: `docs/roadmap/next-q2/track-s-graph-runtime.md`

## Context
The graph runtime provides deterministic orchestration for multi-step agent flows. It models
state as typed channels with reducers, executes nodes when inputs change, and persists snapshots
via the checkpoint manager for crash recovery and replay.

## Goals
- Typed channel reads/writes with reducer semantics.
- Deterministic node execution with retries and caching.
- Checkpoint-backed resume at node boundaries.
- Event emission for telemetry and UI feedback.

## Non-Goals
- Distributed graph scheduling.
- Parallel execution across multiple machines.

## Graph Builder API
Use the graph builder to declare channels and nodes.

```ts
import {
  createGraphBuilder,
  sumReducer,
  replaceReducer,
  arrayAppendReducer,
} from "@ku0/agent-runtime";

const builder = createGraphBuilder();
const count = builder.createChannel<number>("count", { reducer: sumReducer });
const log = builder.createChannel<number[]>("log", { reducer: arrayAppendReducer });

builder.addNode({
  name: "seed",
  reads: [],
  writes: [count],
  run: async (ctx) => {
    ctx.write(count, 1);
    return { status: "completed" };
  },
});

builder.addNode({
  name: "logger",
  reads: [count],
  writes: [log],
  run: async (ctx) => {
    ctx.write(log, [ctx.read(count) ?? 0]);
    return { status: "completed" };
  },
});

const graph = builder.build();
```

## Graph Runner
The runner evaluates runnable nodes, applies retries, and checkpoints state.

```ts
import { GraphRunner, createGraphNodeCache } from "@ku0/agent-runtime";
import { createCheckpointManager } from "@ku0/agent-runtime";

const cache = createGraphNodeCache();
const manager = createCheckpointManager();

const runner = new GraphRunner({
  graph,
  cache,
  cacheContext: { policyVersion: "v1" },
  checkpoint: {
    manager,
    create: { task: "graph", agentType: "graph", agentId: "runner-1" },
  },
});

const result = await runner.run();
```

### Cache Context
Node cache keys receive a `GraphRunContext` that includes `cacheContext`. Use this to scope
cache keys by policy or config version.

```ts
builder.addNode({
  name: "cached-node",
  reads: [count],
  writes: [log],
  cachePolicy: {
    getKey: (inputs, context) =>
      `node:${inputs.count}:${String(context.cacheContext?.policyVersion ?? "default")}`,
  },
  run: async (ctx) => {
    ctx.write(log, [ctx.read(count) ?? 0]);
    return { status: "completed" };
  },
});
```

## Checkpoints and Resume
Graph snapshots are stored under `checkpoint.metadata.graph`. On resume, the runner loads
the snapshot and continues deterministically from the stored channel versions and node states.

## Events
The runner emits the following runtime events:
- `graph:run_started`
- `graph:node_started`
- `graph:node_completed`
- `graph:node_failed`
- `graph:retry`
- `graph:cache_hit`
- `graph:run_completed`

## Testing
Suggested command:
```bash
pnpm --filter @ku0/agent-runtime test -- --grep "graph"
```
