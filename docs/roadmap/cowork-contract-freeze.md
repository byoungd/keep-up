# Cowork Parallel Dev Contract Freeze (Cross-Track Alignment)

## Purpose
Lock the minimum shared contracts so Tracks 1–6 can proceed in parallel
without blocking each other.

## Contract Freeze v0.1 (Required)

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

### Artifact Metadata
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

## Change Control
Any change to this contract must:
- Be documented in this file with a version bump.
- Be announced to all track owners before implementation.
