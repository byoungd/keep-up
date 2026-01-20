# Time Travel and Stale Context Integrity (v1)

Status: Implemented  
Owner: Agent Runtime  
Last Updated: 2026-02-15  
Applies to: Agent Runtime v1  
Related docs: `docs/roadmap/next-q2/track-v-workspace-time-travel.md`

## Context
Workspace time travel is built on git-backed shadow checkpoints and deterministic message
rewind cleanup. File context tracking guards against unsafe edits after external changes.

## Goals
- Save and restore workspace snapshots via a shadow git repository.
- Clean summary and truncation markers during rewinds.
- Detect stale files and block edits until reload.
- Surface stale warnings to runtime UI surfaces.

## Shadow Checkpoints
Shadow checkpoints use a per-task git repo with sanitized environment variables.

```ts
import { ShadowCheckpointService } from "@ku0/agent-runtime";

const service = new ShadowCheckpointService({
  taskId: "task-1",
  workspacePath: "/path/to/workspace",
  storagePath: "/path/to/.agent-runtime/shadow",
  logger,
});

await service.init();
await service.saveCheckpoint("checkpoint message");
const diff = await service.getDiff();
await service.restoreCheckpoint(diff[0]?.commit ?? "");
```

Checkpoint metadata is stored under `checkpoint.metadata.shadowCheckpoint`.

## Message Rewind
Rewind operations remove stale summaries and truncation markers.

```ts
import { MessageRewindManager } from "@ku0/agent-runtime";

const manager = new MessageRewindManager();
const result = manager.rewindToIndex(messages, 10);
```

## File Context Tracking
File context entries are marked stale when external edits are detected.

```ts
import { createFileContextTracker } from "@ku0/agent-runtime";

const tracker = createFileContextTracker({ workspacePath });
const handle = tracker.getHandle("ctx-1");
handle.markRead("docs/README.md");
```

When a stale file is edited through code tools, the request fails with `CONFLICT` and a
message instructing the user to reload.

## UI Warning Surface
Stale-file warnings are emitted as `context:file-stale` events on the runtime event bus.
CLI and VSCode prompt runners subscribe to this event and surface a warning message. The
runtime event stream bridge forwards the warning as metadata and a recoverable error.

## Testing
Suggested command:
```bash
pnpm --filter @ku0/agent-runtime test -- --grep "checkpoint|rewind|stale"
```
