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
- Reduce coupling by isolating kernel, cognition, execution, artifact, and adapter planes with stable interfaces.
- Make TaskGraph + event log the single source of truth for task state and artifacts.

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
- ContextFrame: Deterministic, tiered context snapshot assembled for LLM requests.
- ExecutionDecision: Policy + sandbox gating result for a tool call.
- ToolExecutionRecord: Normalized telemetry record for a tool execution.

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
- Kernel-first state: TaskGraph + event log are the only source of task state.
- Plane isolation: cognition is side-effect free; execution is the side-effect boundary; adapters are replaceable.

## Decoupling Strategy (Kernel + Planes)
- Runtime Kernel: TaskGraph + EventLog + snapshotting; owns task state and replay.
- Turn Controller: thin state machine that delegates and emits events.
- Cognition Plane: planning, reasoning, memory, and context frame assembly; no side effects.
- Execution Plane: policy, approvals, sandbox, rate limiting, tool execution; emits execution records.
- Artifact Plane: schema validation, storage, and emission of deliverables.
- Adapter Plane: MCP, LSP, Terminal, Web, Skills; replaceable via stable interfaces.
- All cross-plane interactions are via interfaces and events, not direct data mutation.

## Target Capabilities
1. Task lifecycle: Plan -> Subtasks -> Execute -> Review -> Summary.
2. Parallel task execution with mid-task steering and bounded scopes.
3. Artifact schema library (PlanCard, DiffCard, ReportCard, ChecklistCard).
4. Scoped file system and connector grants with explicit approvals.
5. Safety pipeline: prompt injection detection, sandbox enforcement, audit logs.
6. Multi-model routing with policy constraints and cost controls.
7. Deterministic event log replay and resumable task state.
8. Streaming progress events with partial tool results and resumable streams.

## Architecture Overview
```
Client/UI
  -> Runtime API
     -> TaskGraph Kernel + EventLog
        -> Turn Controller
           -> Cognition Plane (planning, reasoning, memory, context frame)
           -> Execution Plane (policy, approvals, sandbox, tools)
           -> Artifact Plane (validation, storage, emit)
           -> Adapter Plane (MCP, LSP, Terminal, Web, Skills)
```

The Kernel is the single source of truth. All task state transitions and deliverables emit events
that are replayable and auditable.

## Proposed Architecture Optimizations

### 1) Runtime Kernel (TaskGraph + Event Log)
Current pain: orchestration is spread across task runner, queue, and orchestration flows.  
Optimization:
- Make TaskGraph + EventLog mandatory for every run (not optional).
- Version events with correlation id, source, and idempotency key.
- Enforce allowed status transitions with stable node ids.
- Snapshot and compact the log for fast resume and bounded storage.

### 2) Turn Controller Decomposition
Current pain: orchestrator mixes decision logic, policy checks, and execution.  
Optimization:
- Keep a thin Turn Controller state machine.
- Delegate cognition and execution through interfaces (dependency inversion).
- Emit every state transition as a TaskGraph event.

### 3) Unified Execution Plane
Current pain: policy, sandbox, approvals, and telemetry are scattered.  
Optimization:
- ToolExecutionService runs: policy -> sandbox -> rate limit -> execute -> audit.
- Emit ExecutionDecision + ToolExecutionRecord for each tool call.
- Bind approvals to TaskGraph node ids with explicit reason codes.

### 4) Artifact Pipeline
Current pain: outputs are delivered as unstructured messages.  
Optimization:
- ArtifactRegistry is first-class with versioned schemas.
- Validate before UI rendering; quarantine invalid artifacts with diagnostics.
- Link artifacts to TaskGraph nodes and tool calls for lineage.

### 5) Context Frame + Memory Layers
Current pain: context is not consistently tiered.  
Optimization:
- Introduce a ContextFrame builder with tiered sources and token budgets.
- Deterministic ordering, redaction, and source attribution.
- Cowork mode defaults to no cross-session memory.

### 6) Model Routing + Cost Control
Current pain: model selection is ad hoc.  
Optimization:
- ModelRouter is called per turn with task class, risk, and budget.
- Emit routing decisions and fallback events with reason codes.

### 7) Subagent Contracts with Hard Scopes
Current pain: scope is soft and only enforced in orchestration.  
Optimization:
- Subagent contract declares allowed tools, file scope, network scope, and output artifact type.
- Enforce scope in PolicyEngine + Sandbox, not just in orchestration.
- Subagent outputs are stored as artifacts linked to parent TaskGraph nodes.

### 8) Streaming + Progress Plane
Current pain: streaming is inconsistent and lacks partial tool progress.  
Optimization:
- Stream typed events (token, tool progress, artifact preview).
- Backpressure + checkpoint-based resume for long tasks.
- "No dead air" placeholder after 2s without tokens.

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
  sequenceId: number;
  eventVersion: number;
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
  correlationId?: string;
  source?: string;
  idempotencyKey?: string;
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
  requiresConfirmation: boolean;
  reason?: string;
  riskTags?: string[];
  requiredApprovals?: string[];
}
```

### Execution Decision + Record
```ts
export interface ExecutionDecision {
  decisionId: string;
  allowed: boolean;
  requiresConfirmation: boolean;
  reason?: string;
  riskTags?: string[];
  sandboxed: boolean;
}

export interface ToolExecutionRecord {
  toolCallId: string;
  toolName: string;
  status: "started" | "completed" | "failed";
  durationMs: number;
  affectedPaths?: string[];
  policyDecisionId?: string;
  sandboxed: boolean;
  error?: string;
}
```

### Context Frame
```ts
export interface ContextFrame {
  frameId: string;
  sources: {
    shortTerm: string[];
    project: string[];
    memory: string[];
    tools: string[];
  };
  redactions: string[];
  tokenBudget: { maxTokens: number; usedTokens: number };
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
  taskNodeId?: string;
}
```

### Subagent Contract
```ts
export interface SubagentContract {
  id: string;
  scope: { filePaths: string[]; connectors: string[]; network: "none" | "restricted" | "full" };
  objective: string;
  outputArtifactType: "ReportCard" | "ChecklistCard" | "DiffCard";
  allowedTools?: string[];
  timeBudgetMs?: number;
  maxTokens?: number;
}
```

## Data Flow (High-Level)
1. Request enters, Kernel creates TaskGraph root + PlanCard.
2. Turn Controller builds a ContextFrame and requests a ModelRoute decision.
3. LLM response yields tool calls; Execution Plane emits ExecutionDecision + ToolExecutionRecord.
4. Tool calls execute via sandbox adapter with policy enforcement.
5. AI edits use the AI Envelope and dry-run pipeline before application.
6. Artifacts are validated, stored, and emitted to UI.
7. Summary node compiles audit log, artifacts, and final outputs from the event log.

## Failure Handling and Recovery
- Policy denial creates a blocked node with required approvals attached.
- Sandbox violations fail the node and emit a violation event with diagnostics.
- Tool failures mark nodes failed; retry uses idempotency keys and backoff.
- Event log replay uses checkpoints to resume without re-running side effects.
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
- Context frame token budget usage and redaction counts.
- Tool error rate by type and affected path.
- Model routing fallback rate and decision latency.
- Sandbox violations and recovery rate.

## Rollout Plan
- Phase 0: Instrument current runtime to emit TaskGraph-compatible events with correlation ids.
- Phase 1: Make TaskGraph kernel default; extract Turn Controller from orchestrator.
- Phase 2: Implement Unified Execution Plane (policy + sandbox + approvals + audit).
- Phase 3: Introduce ContextFrame builder and memory gating.
- Phase 4: Promote Artifact Pipeline + streaming progress events to first-class.
- Phase 5: Integrate Model Router and enforce subagent contracts with hard scopes.

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
- TaskGraph kernel is the default path with replayable events and snapshotting.
- Unified Execution Plane emits ExecutionDecision + ToolExecutionRecord for each call.
- Policy decisions are visible with reasons, risk tags, and approval linkage.
- Artifact registry supports Plan/Diff/Report/Checklist with validation and quarantine.
- ContextFrame builder enforces tiered sources, token budgets, and redaction.
- Model router enforces budgets and emits routing decisions and fallbacks.
- Subagent contracts are enforced at policy + sandbox boundaries.
- AI edits use the AI Envelope and dry-run pipeline consistently.
