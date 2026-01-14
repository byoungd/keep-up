# Cowork API Contracts (Phase 3)

## Purpose
Define concrete runtime contracts for Cowork mode so the desktop app, orchestration layer, and tools can integrate consistently.

## Core Types

### CoworkSession
```ts
interface CoworkSession {
  sessionId: string;
  userId: string;
  deviceId: string;
  platform: "macos";
  mode: "cowork";
  grants: FolderGrant[];
  connectors: ConnectorGrant[];
  createdAt: number;
  expiresAt?: number;
}
```

### FolderGrant
```ts
interface FolderGrant {
  id: string;
  rootPath: string;
  allowWrite: boolean;
  allowDelete: boolean;
  allowCreate: boolean;
  outputRoots?: string[];
}
```

### ConnectorGrant
```ts
interface ConnectorGrant {
  id: string;
  provider: string;
  scopes: string[];
  allowActions: boolean;
}
```

### CoworkTask
```ts
interface CoworkTask {
  taskId: string;
  sessionId: string;
  title: string;
  prompt: string;
  status:
    | "queued"
    | "planning"
    | "ready"
    | "running"
    | "awaiting_confirmation"
    | "completed"
    | "failed"
    | "cancelled";
  plan?: TaskPlan;
  createdAt: number;
  updatedAt: number;
}
```

### TaskPlan
```ts
interface TaskPlan {
  planId: string;
  steps: PlanStep[];
  dependencies: PlanDependency[];
  riskTags: RiskTag[];
  estimatedActions: string[];
}

interface PlanStep {
  stepId: string;
  title: string;
  description: string;
  requiresConfirmation: boolean;
}

interface PlanDependency {
  stepId: string;
  dependsOn: string[];
}

type RiskTag = "delete" | "overwrite" | "network" | "connector" | "batch";
```

### TaskSummary
```ts
interface TaskSummary {
  taskId: string;
  outputs: OutputArtifact[];
  fileChanges: FileChange[];
  actionLog: ActionLogEntry[];
  followups: string[];
}

interface OutputArtifact {
  path: string;
  kind: "document" | "spreadsheet" | "image" | "other";
}

interface FileChange {
  path: string;
  change: "create" | "update" | "delete" | "rename" | "move";
}

interface ActionLogEntry {
  timestamp: number;
  action: string;
  details: string;
}
```

## Event Contracts

### Session Events
```ts
interface SessionEvent {
  type: "session.start" | "session.end" | "session.error";
  sessionId: string;
  timestamp: number;
  data?: Record<string, unknown>;
}
```

### Task Events
```ts
interface TaskEvent {
  type:
    | "task.queued"
    | "task.planning"
    | "task.plan_ready"
    | "task.running"
    | "task.confirmation_required"
    | "task.confirmation_received"
    | "task.progress"
    | "task.completed"
    | "task.failed"
    | "task.cancelled";
  taskId: string;
  timestamp: number;
  data?: Record<string, unknown>;
}
```

### Subagent Events
```ts
interface SubagentEvent {
  type: "subagent.spawned" | "subagent.completed" | "subagent.failed";
  taskId: string;
  agentId: string;
  timestamp: number;
  data?: Record<string, unknown>;
}
```

### Tool Events
```ts
interface ToolEvent {
  type: "tool.call" | "tool.result" | "tool.error";
  taskId: string;
  toolName: string;
  timestamp: number;
  data?: Record<string, unknown>;
}
```

## Confirmation Contract
```ts
interface ConfirmationRequest {
  requestId: string;
  taskId: string;
  reason: string;
  riskTags: RiskTag[];
  proposedActions: string[];
}

interface ConfirmationResponse {
  requestId: string;
  approved: boolean;
  notes?: string;
}
```

## API Surface (Draft)
- `createCoworkSession(grants, connectors)`
- `enqueueCoworkTask(sessionId, prompt)`
- `pauseTask(taskId)`, `resumeTask(taskId)`, `cancelTask(taskId)`
- `streamTaskEvents(taskId)`
- `submitConfirmation(response)`

## Open Questions
- Should a task have multiple confirmations or one per plan step?
- How should partial outputs be exposed during execution?
