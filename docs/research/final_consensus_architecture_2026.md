# [SUPERSEDED] Final Consensus: The Keep-Up Agent Architecture (2026)

> **NOTE:** This document is now historical. The authoritative specification is at `docs/specs/agent-runtime-spec-2026.md`.

# Final Consensus: The Keep-Up Agent Architecture (2026)

**Document ID**: CONSENSUS-2026-FINAL
**Date**: January 18, 2026
**Status**: **AUTHORITATIVE**
**Authors**: Antigravity & Keep-Up Engineering Team
**Sources**: 
- `deep_source_analysis_agent_frameworks.md` (Source Code Evidence)
- `agent_architecture_best_practices.md` (Team Analysis)
- `antigravity_final_solution.md` (Architect Recommended)
- `final_agent_architecture_v1.md` (Engineering Lead Approved)

---

## 1. Executive Consensus

After a comprehensive review of 6 industry-leading frameworks (**OpenCode, Gemini CLI, LangGraph, MetaGPT, AutoGen, CrewAI**) and internal analysis deliverables, we have reached a **unanimous consensus** on the architecture for the next generation of Keep-Up.

The architecture is defined by **Four Non-Negotiable Pillars** that solve the critical "Silent Failure" and "Complexity Ceiling" problems.

### The 4 Pillars of Convergence

| Pillar | Concept | Pattern Source | The "Keep-Up" Implementation |
| :--- | :--- | :--- | :--- |
| **I. Resilience** | **Graceful Recovery** | Gemini CLI / Local Executor | **`GracefulRecoveryEngine`**: Middleware that intercepts turn-limit signals, injecting a "Final Warning" to force a clean summarization exit. |
| **II. Scale** | **Recursive Delegation** | OpenCode / Agent-Tool | **`DelegateToAgent` Tool**: A universal capability allowing any agent to spawn a child agent with a fresh context window, forming a fractal tree. |
| **III. Time** | **Checkpoint State** | LangGraph / Pregel | **`SQLiteCheckpointer`**: Transactional state persistence (inputs, messages, tool outputs) enabling crash recovery and time-travel debugging. |
| **IV. Quality** | **Process SOPs** | MetaGPT / Role | **`SOPExecutor`**: Role definitions that enforce a "Plan → Act → Verify" phase loop, preventing agents from skipping quality gates. |

---

## 2. The Unified Architecture Specification

The system is organized into three distinct layers: **Control**, **Execution**, and **Persistence**.

### 2.1 The Control Plane (Safety & Routing)

This layer manages the *lifecycle* and *safety* of agents.

*   **`AgentManager`**: upgraded to support a **Tree Topology**.
    *   *Responsibility*: Spawns agents, tracks Parent-Child relationships, aggregates cost/token usage up the tree.
*   **`GracefulRecoveryEngine`**:
    *   *Logic*: `if (turns > max - 2) inject("⚠️ Final Warning")`
    *   *Contract*: Agent MUST use `complete_task` tool to exit.
*   **`RuntimeEventBus`**:
    *   *Protocol*: Pub/Sub model for logging, UI updates, and inter-agent signals (derived from AutoGen).

### 2.2 The Execution Plane (Intelligence)

This layer runs the actual cognitive loops.

*   **`Orchestrator (State Machine)`**:
    *   *States*: `Idle` → `Thinking` → `ToolWait` → `Observation` → `Recovery` → `Done`.
*   **`TurnExecutor`**:
    *   *Optimization*: Handles Context Compression (smart context window management) and Knowledge Injection.
*   **`SOPExecutor`**:
    *   *Mechanism*: Filters the `ToolRegistry` based on the current *Phase*.
    *   *Example*: In the "Plan" phase, `write_file` is disabled; only `search_code` is allowed.

### 2.3 The Persistence Plane (Memory)

This layer ensures data durability.

*   **`SQLiteCheckpointer`**:
    *   *Schema*: Stores `(thread_id, step_id, state_blob)` after *every* tool result.
    *   *Benefit*: Zero-config local persistence.
*   **`ArtifactManager`**:
    *   *Role*: Stores generation outputs (files, plans) separate from conversation state (Loro/CRDT alignment).

---

## 3. Top-Level Data Structures (TypeScript)

### 3.1 The Agent State
```typescript
interface AgentState {
  id: string;
  role: string;
  parentId?: string;
  status: "active" | "recovering" | "completed" | "failed";
  sopPhase: string; // e.g., "plan", "implement"
  history: Message[];
  contextVariables: Record<string, any>;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cost: number;
  };
}
```

### 3.2 The Checkpoint
```typescript
interface Checkpoint {
  threadId: string;
  step: number;
  timestamp: string; // ISO8601
  state: AgentState; // JSON blob
  pendingCreates: string[]; // Files created in this step
}
```

### 3.3 The Recovery Config
```typescript
interface RecoveryConfig {
  graceTurns: number; // default: 2
  warningTemplate: string; // "You are running out of turns..."
  hardLimit: boolean; // if true, kill after grace turns
}
```

---

## 4. Implementation Strategy: The " Robustness First" Path

We will execute in 3 linear phases to minimize risk.

### Phase 1: Robustness (The "Gemini" Phase)
**Goal**: Stop silent failures.
1.  **Orchestrator Logic**: Add the "Warning Turn" condition.
2.  **`GracefulRecoveryEngine`**: Implement the middleware.
3.  **Tool Contract**: Enforce `complete_task` schema.

### Phase 2: Scale & Persistence (The "LangGraph" Phase)
**Goal**: Infinite context & crash safety.
1.  **`DelegateToAgent`**: Implement the recursive spawning tool.
2.  **`SQLiteCheckpointer`**: Implement DB writes on turn ends.
3.  **UI Upgrade**: Show nested agent threads in the UI.

### Phase 3: Specialization (The "MetaGPT" Phase)
**Goal**: High-quality engineering.
1.  **`SOPDefinition`**: Define the "Coder" SOP (Plan -> Code -> Test).
2.  **`SOPExecutor`**: Gating logic for tools.

---

## 5. Final Decision Record

| Decision | Verdict | Reason |
| :--- | :--- | :--- |
| **Framework Base** | Custom (TypeScript) | We keep our Next.js/TS stack. AutoGen/LangGraph are great references, but Python runtime is a blocker. |
| **State DB** | SQLite | Simple, file-based, SQL-queryable for debugging. |
| **Loop Type** | Deterministic | We reject "infinite loops" in favor of strict turn limits + recovery. |
| **Inter-Agent** | Tool-Call | Using `DelegateToAgent` tool is simpler than a full Actor Model for now. |

---

**Signed & Sealed**,

**Antigravity**
*AI Architect*

**Han**
*Engineering Lead*
