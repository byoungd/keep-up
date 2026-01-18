# Cowork Parallel Dev Contract Freeze (Cross-Track Alignment)

## Purpose
Lock the minimum shared contracts so Tracks 1–6 can proceed in parallel
without blocking each other.

## Contract Freeze v0.3 (Aligned with Agent Spec 2026.1)

> **Normative Reference**: `docs/specs/agent-runtime-spec-2026.md` takes precedence for runtime behavior.

### ChatMessage Schema
```ts
interface ChatMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  status: "pending" | "streaming" | "done" | "error" | "canceled";
  modelId?: string;
  providerId?: string;
  fallbackNotice?: string;
  parentId?: string;
  attachments?: ChatAttachmentRef[];
  taskId?: string;
  metadata?: Record<string, unknown>;
}
```

### Attachments
```ts
interface ChatAttachmentRef {
  id: string;
  kind: "image" | "file";
  name: string;
  sizeBytes: number;
  mimeType: string;
  storageUri: string;
}
```

### SSE Events (Chat + Task)
- `message.created`, `message.delta`, `message.completed`, `message.error`
- `task.status`, `task.plan`, `task.step`, `task.tool`, `task.artifact`
- `task.recovery` (New: Final Warning turn per Spec 5.2)
- `task.completion` (New: Validated completion output per Spec 5.1)
- `token.usage` (Phase 2+; see Track 10 payload)
- Required fields: `sessionId`, `messageId?`, `taskId?`, `timestamp`, `id`

### Approval Metadata
```ts
interface ApprovalMetadata {
  approvalId: string;
  toolName: string;
  args: Record<string, unknown>;
  riskTags: Array<"delete" | "overwrite" | "network" | "connector" | "batch">;
  reason?: string;
}
```

### Artifact Metadata (Aligns with Spec 8.3)
```ts
interface ArtifactMeta {
  id: string;
  taskId: string;
  type: "diff" | "plan" | "markdown";
  title: string;
  version: number;
  status: "pending" | "ready" | "applied" | "failed";
  sourcePath?: string;
  createdAt: number;
  updatedAt: number;
}
```

### Idempotency + Ordering Rules
- Every client send includes `client_request_id`.
- Server maps `client_request_id -> messageId` and returns it in `message.created`.
- Streaming deltas attach to that `messageId` only.
- Sorting order: `createdAt`, then stable `id` tiebreak.
- Reconnect must dedupe on `event.id`.

## Track Dependencies (Minimal Alignment)
- Track 1 owns ChatMessage + Attachments persistence.
- Track 5 owns event idempotency and ordering guarantees.
- Track 3 consumes ApprovalMetadata + ArtifactMeta for inline rendering.
- Track 6 produces artifact status changes; Track 3 displays them.
- **Agent Runtime** produces `task.*` events following Spec 5.7 contracts.

## Change Control
Any change to this contract must:
- Be documented in this file with a version bump.
- Be announced to all track owners before implementation.
