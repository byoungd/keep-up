#!/usr/bin/env markdown
# Agent Runtime Deep Optimization Spec (v1)

Status: Draft  
Owner: Agent Runtime  
Last Updated: 2026-01-14  
Applies to: Agent Runtime v1, LFCC v0.9 RC  
Related specs: `docs/specs/engineering/06_AI_Envelope_Specification.md`, `docs/specs/engineering/07_AI_Dry_Run_Pipeline_Design.md`, `docs/specs/engineering/02_Policy_Manifest_Schema.md`, `docs/specs/cowork/cowork-sandbox-design.md`, `docs/specs/cowork/cowork-safety-spec.md`

## Context
Keep-Up agent-runtime already supports Cowork-aligned behaviors, policy gating, and task orchestration. This spec consolidates external product signals and internal LFCC requirements into a unified architecture optimization plan that strengthens task mode, execution safety, artifact delivery, and extensibility without violating LFCC/Loro constraints.

## Goals
- Tighten end-to-end task execution into a deterministic, auditable, and resumable pipeline.
- Provide stronger permission scoping and destructive-action gating.
- Improve artifact quality (documents, presentations, reports) with structured delivery.
- Enable parallel subtask orchestration with clear progress and mid-task steering.
- Keep the runtime model-agnostic and connector-agnostic while enforcing safety.

## Non-Goals
- Replacing LFCC/Loro or editor invariants.
- Building a new AI gateway outside `packages/agent-runtime`.
- Recreating a full IDE; runtime remains a backend orchestration layer.

## Constraints and Dependencies
- Loro is the only CRDT; do not introduce Yjs artifacts or conversions.
- All AI writes must use the AI Envelope and dry-run pipeline before applying edits.
- Policy decisions must conform to the policy manifest schema and be replayable.
- Execution sandboxing must align with Cowork sandbox and safety specs.
- All new runtime state must be derivable from deterministic event logs.

## Terminology
- TaskGraph: Event-sourced DAG that models plan, subtask, tool_call, artifact, review, and summary nodes.
- Task node: A unit of work with explicit status transitions and dependencies.
- Artifact: Structured output with a versioned schema and validation.
- Policy decision: Allow/deny outcome with risk tags and approval requirements.
- Execution sandbox: Isolated environment for tool calls with scoped resources.

## External Product Signals
These signals are used to extract capabilities and risk controls rather than UI details.

### Claude Cowork
- Folder-scoped local file access with explicit user grants.
- Plan -> subtask -> execution -> summary task lifecycle, with progress indicators.
- Parallel sub-agents, VM-based execution, and mid-task steering.
- Safety guidance: destructive actions and prompt injection precautions.
Sources: https://claude.com/blog/cowork-research-preview, https://support.claude.com/en/articles/13345190-getting-started-with-cowork, https://support.claude.com/en/articles/13364135-using-cowork-safely

### Manus
- Delivery-first UX: generate concrete outputs (slides, sites, docs) rather than chat.
- Large catalog of task templates implies strong artifact workflows.
Sources: https://manus.im/, https://manus.ai/

### AnyGen
- Voice-driven workspace that converts fragmented inputs into structured documents.
- Emphasis on workflow templates and multi-format outputs (docs/slides/pages).
Source: https://anygenai.org/zh

### OpenCode / Crush
- Terminal-first agent with multi-model support, tool integration, session management, LSP context.
- MCP-style extensibility and broad platform support.
Sources: https://github.com/opencode-ai/opencode, https://github.com/charmbracelet/crush

### Claude Code
- Agentic coding via terminal commands with plugin extensibility.
Source: https://github.com/anthropics/claude-code

### Cursor
- Agent workflow embedded in IDE; delegates tasks and reports diffs/results.
Source: https://www.cursor.com/features

## Architecture Principles
- Deterministic state: shared state is derived from Loro snapshots/updates.
- Policy-first execution: every tool action requires policy evaluation and logging.
- Artifact-first delivery: prefer structured outputs over plain text.
- Least-privilege access: file and connector scopes are explicit and time-bounded.
- Traceable and resumable: task graphs produce replayable event logs.
- Idempotent tooling: all tool calls must be safe to retry via idempotency keys.

## Target Capabilities
1. Task lifecycle: Plan -> Subtasks -> Execute -> Review -> Summary.
2. Parallel task execution with mid-task steering and bounded scopes.
3. Artifact schema library (PlanCard, DiffCard, ReportCard, ChecklistCard).
4. Scoped file system and connector grants with explicit approvals.
5. Safety pipeline: prompt injection detection, sandbox enforcement, audit logs.
6. Multi-model routing with policy constraints and cost controls.
7. Deterministic event log replay and resumable task state.

## Architecture Overview
1. Planner builds a TaskGraph and emits a PlanCard artifact.
2. Orchestrator schedules nodes, spawns subagents, and tracks progress.
3. PolicyEngine evaluates each tool call with task, scope, and risk context.
4. ExecutionSandboxAdapter executes tool calls and emits structured telemetry.
5. ArtifactRegistry validates, versions, and stores structured outputs.
6. ContextManager assembles tiered context frames with redaction.
7. ModelRouter selects models based on policy, cost, and capability.

## Proposed Architecture Optimizations

### 1) Task Graph Kernel
Current pain: orchestration is spread across task runner, queue, and orchestration flows.  
Optimization:
- Introduce a canonical `TaskGraph` with nodes for plan, subtask, tool_call, artifact, review, summary.
- Event-sourced log records node creation, transitions, tool results, and artifacts.
- Enforce allowed status transitions and idempotent retries using stable node ids.
- Provide snapshotting for fast resume without replaying the full log.

### 2) Policy + Permission Unification
Current pain: policy checks are applied per-tool but not tied to task state.  
Optimization:
- Centralize evaluation in `PolicyEngine` with decision context: task, node, tool, file path, connector, risk tag.
- Emit policy decisions as events with reason codes and required approvals.
- Tie approvals to `TaskGraph` node ids for deterministic replays and auditing.

### 3) Execution Sandbox Envelope
Current pain: tool execution isolation is partial and not uniform.  
Optimization:
- Standardize on `ExecutionSandboxAdapter` for all tool calls.
- Enforce path allowlist, connector allowlist, environment allowlist, and network policy.
- Emit structured telemetry: command, duration, exit status, affected paths, and sandbox violations.

### 4) Artifact System
Current pain: outputs are delivered as unstructured messages.  
Optimization:
- Define a registry of versioned artifact schemas (JSON + typed TS definitions).
- Artifacts store references to source task nodes and tool calls.
- Validate artifacts before UI rendering; invalid artifacts are quarantined with diagnostics.

### 5) Memory + Context Layers
Current pain: context is not consistently tiered.  
Optimization:
- `ShortTermContext` (task/session).
- `ProjectContext` (task.md, implementation_plan.md, docs/tasks, brain).
- `NoCrossSessionMemory` for Cowork mode.
- Token budgeter with priority and redaction tiers.

### 6) Multi-Model Router
Current pain: model selection is ad hoc.  
Optimization:
- Policy-driven model routing based on task class, risk, and budget.
- Fallback and retry policy with structured telemetry and reason codes.

### 7) Subagent Orchestration
Current pain: parallel work not first-class.  
Optimization:
- Orchestrator spawns subagent tasks with bounded scopes.
- Each subagent gets isolated context and an explicit output contract.

## Data Model and Interface Sketches

### TaskGraph Node (TypeScript)
```ts
export type TaskNodeType = "plan" | "subtask" | "tool_call" | "artifact" | "review" | "summary";
export type TaskNodeStatus = "pending" | "running" | "blocked" | "completed" | "failed";

export interface TaskGraphNode {
  id: string;
  type: TaskNodeType;
  title: string;
  status: TaskNodeStatus;
  dependsOn: string[];
  toolCallId?: string;
  artifactId?: string;
  createdAt: string;
  updatedAt: string;
}
```

### TaskGraph Edge and Event
```ts
export interface TaskGraphEdge {
  from: string;
  to: string;
  type: "depends_on" | "blocks";
}

export interface TaskGraphEvent {
  id: string;
  nodeId: string;
  type:
    | "node_created"
    | "node_started"
    | "node_blocked"
    | "node_completed"
    | "node_failed"
    | "node_updated"
    | "tool_call_started"
    | "tool_call_finished"
    | "artifact_emitted"
    | "policy_decision";
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface TaskGraphSnapshot {
  graphId: string;
  nodes: TaskGraphNode[];
  edges: TaskGraphEdge[];
  events: TaskGraphEvent[];
  checkpoint?: { eventId: string; createdAt: string };
}
```

### Policy Decision
```ts
export interface PolicyContext {
  taskId: string;
  nodeId: string;
  toolName?: string;
  filePaths?: string[];
  connectorScopes?: string[];
  riskTags?: string[];
}

export interface PolicyDecision {
  decisionId: string;
  allowed: boolean;
  reason: string;
  riskTags: string[];
  requiredApprovals?: string[];
}
```

### Execution Sandbox Result
```ts
export interface SandboxExecutionResult {
  command: string;
  exitCode: number;
  durationMs: number;
  stdout?: string;
  stderr?: string;
  affectedPaths?: string[];
  violation?: string;
}
```

### Artifact Envelope
```ts
export interface ArtifactEnvelope {
  id: string;
  type: "PlanCard" | "DiffCard" | "ReportCard" | "ChecklistCard";
  schemaVersion: string;
  title: string;
  payload: Record<string, unknown>;
  taskNodeId: string;
  createdAt: string;
  renderHints?: Record<string, unknown>;
}

export interface ArtifactValidationResult {
  valid: boolean;
  errors?: string[];
}
```

### Model Routing
```ts
export interface ModelRouteDecision {
  modelId: string;
  reason: string;
  fallbackModels: string[];
  budget: { maxTokens: number; maxCostUsd?: number };
}
```

### Subagent Contract
```ts
export interface SubagentContract {
  id: string;
  scope: { filePaths: string[]; connectors: string[]; network: "none" | "restricted" | "full" };
  objective: string;
  outputArtifactType: "ReportCard" | "ChecklistCard" | "DiffCard";
}
```

## Data Flow (High-Level)
1. Request enters with scope and policy context.
2. Planner produces TaskGraph nodes and artifacts (PlanCard).
3. Orchestrator schedules parallel subtask nodes.
4. Tool calls execute via sandbox adapter with policy enforcement.
5. AI edits use the AI Envelope and dry-run pipeline before application.
6. Artifacts are validated, stored, and emitted to UI.
7. Summary node compiles audit log and final outputs.

## Failure Handling and Recovery
- Policy denial creates a blocked node with required approvals attached.
- Sandbox violations fail the node and emit a violation event with diagnostics.
- Tool failures mark nodes failed; retry uses idempotency keys and backoff.
- AI Envelope conflicts (409) trigger rebase and re-evaluation of preconditions.
- Artifact validation failures quarantine artifacts and surface diagnostics.

## Safety & Compliance
- Prompt injection signals are flagged and surfaced as risk tags.
- All tool calls require policy decision plus audit log entries.
- Destructive actions require explicit confirmation with reason display.
- Folder-scoped file access is mandatory (no implicit broad access).
- Context frames are redacted for secrets and PII when policy requires it.

## Metrics & Observability
- Task completion rate, failure rate, and retry counts.
- Time-to-first-artifact and time-to-final-summary.
- Policy denial reasons and approval latency.
- Tool error rate by type and affected path.
- Sandbox violations and recovery rate.

## Rollout Plan
- Phase 0: Instrument current runtime to emit TaskGraph-compatible events.
- Phase 1: Implement TaskGraph kernel and event replay with snapshots.
- Phase 2: Centralize PolicyEngine and sandbox adapter telemetry.
- Phase 3: Artifact registry with validation and UI consumption.
- Phase 4: Model router with budget enforcement and fallback policies.

## Risks and Mitigations
- Policy fatigue if approvals are too frequent; mitigate with scope bundles and caching.
- Sandbox performance overhead for heavy workloads; mitigate with caching and batching.
- TaskGraph complexity increases operational burden; mitigate with tooling and snapshots.
- Parallel subagents increase coordination cost; mitigate with strict contracts and scopes.

## Open Questions
- Do we need per-task cost budgets or per-tenant budgets?
- Should artifact validation be best-effort or strict-fail by default?
- What is the minimal viable set of artifact types for v1?
- Which context sources are allowed in Cowork mode by default?

## Acceptance Criteria
- TaskGraph kernel with replayable events and snapshotting is implemented.
- Policy decisions are unified across tools with visible reasons and risk tags.
- Artifact registry supports Plan/Diff/Report/Checklist with validation.
- Sandbox adapter enforces path allowlists and logs execution telemetry.
- Model router enforces budgets and emits routing decisions.
- AI edits use the AI Envelope and dry-run pipeline consistently.
