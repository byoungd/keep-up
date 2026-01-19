#!/usr/bin/env markdown
# Code Agent Architecture and Evaluation Spec (v2026.2)

Status: Final  
Owner: Agent Runtime  
Last Updated: 2026-01-19  
Related: `docs/specs/agent-runtime-spec-2026.md`, `packages/agent-runtime/ARCHITECTURE.md`

---

## 1. Objective

Define the final architecture and evaluation metrics for the Agent Runtime "Code Agent" so it can
reach top-tier coding assistant capability. This spec is grounded in source-level analysis of
leading open-source agent frameworks and extends the runtime contracts defined in
`docs/specs/agent-runtime-spec-2026.md`.

---

## 2. Constraints

- Loro is the only CRDT. No Yjs artifacts or conversions.
- All edits must flow through the AI Envelope and dry-run pipeline.
- Deterministic recovery and event logs are mandatory.
- Safety and policy enforcement are non-optional.
- Documentation and schema definitions are English only.

---

## 3. Source-Level Evidence (Updated)

These files were reviewed after updating the `.tmp/analysis` repositories and inform this spec.

| Framework | Evidence (source path) | Extracted Pattern |
|----------|-------------------------|------------------|
| OpenCode | `.tmp/analysis/opencode/internal/llm/agent/agent.go` | Event-driven agent loop with session isolation |
| OpenCode | `.tmp/analysis/opencode/internal/llm/agent/agent-tool.go` | Agent-as-tool for recursive delegation |
| Gemini CLI | `.tmp/analysis/gemini-cli/packages/core/src/agents/local-executor.ts` | Mandatory `complete_task` and graceful recovery |
| Gemini CLI | `.tmp/analysis/gemini-cli/packages/core/src/services/chatCompressionService.ts` | Context compression and truncation strategy |
| AutoGen | `.tmp/analysis/autogen/python/packages/autogen-core/src/autogen_core/_single_threaded_agent_runtime.py` | Actor runtime with message queue + pub/sub |
| MetaGPT | `.tmp/analysis/MetaGPT/metagpt/roles/role.py` | Role-based SOPs with action orchestration |
| LangGraph | `.tmp/analysis/langgraph/libs/langgraph/langgraph/pregel/main.py` | DAG execution, checkpoints, and state snapshots |
| CrewAI | `.tmp/analysis/crewAI/lib/crewai/src/crewai/crew.py` | Hierarchical orchestration + memory and training hooks |

Key patterns that consistently correlate with top-tier coding agents:
- Recursive delegation (agent-as-tool) for parallel exploration and review.
- Graceful recovery with a final warning turn that forces `complete_task`.
- Checkpointed, replayable state (turn-level recovery).
- Role-specific SOPs and phase-gated tool access.
- Compression and context control to keep long tasks stable.
- Hierarchical orchestration with a manager agent when tasks branch.

---

## 4. Final Code Agent Architecture

### 4.1 High-Level Diagram

```
User Request
  -> Intake + Preflight
     -> Context Frame Builder
        -> Plan Mode (read-only)
           -> PlanCard Artifact
        -> Build Mode (write)
           -> Patch + Tool Execution
           -> Test Runner
        -> Review Mode
           -> Reviewer Subagent + Diff Review
        -> Completion (complete_task)
```

### 4.2 Runtime Components

1. **Intake + Preflight**
   - Normalizes the task, validates workspace paths, and collects environment info.
2. **Context Frame Builder**
   - Deterministic context assembly (files, dependency graph, recent changes).
3. **Plan Mode (read-only)**
   - Produces a PlanCard artifact; no file writes or command execution.
4. **Build Mode**
   - Applies minimal diffs, runs targeted tests, and records ToolExecutionRecords.
5. **Review Mode**
   - Runs an internal reviewer (subagent) to detect regressions and risks.
6. **Completion**
   - Outputs summary + artifacts; must call `complete_task`.
7. **Recovery Path**
   - Final warning and forced completion per the Completion/Recovery contracts.

### 4.3 SOP and Mode Requirements

- **SOP Phases**: understand -> plan -> implement -> verify -> review -> complete  
- **Mode Constraints**:
  - Plan Mode: read-only tools only.
  - Build Mode: write + test tools allowed.
  - Review Mode: read-only + analysis only.
- **Quality Gates**:
  - After implement: tests_exist
  - After verify: tests_pass
  - After review: risk_reported (ReviewReport artifact emitted)

### 4.4 Artifact-First Outputs

Artifacts are mandatory for traceability and review.

| Artifact | Purpose | Required Fields |
|----------|---------|-----------------|
| PlanCard | Task plan and file targets | summary, steps, files |
| DiffCard | Structured change summary | files, hunks, rationale |
| TestReport | Test commands + results | command, status, duration |
| ReviewReport | Risk + regression notes | risks, recommendations |

---

## 5. Code Agent Contracts

1. **Plan-before-write**: A PlanCard must exist before any file writes.
2. **Deterministic edits**: All writes are diff-based and idempotent.
3. **Verification required**: Any code change must run targeted tests or explain why not.
4. **Reviewer handoff**: A reviewer subagent must execute for non-trivial changes.
5. **Completion-only termination**: Use `complete_task` as the single termination path.

---

## 6. Evaluation Metrics (Top-Tier Targets)

Metrics are reported per task and aggregated weekly.

| Category | Metric | Definition | Target |
|----------|--------|------------|--------|
| Correctness | task_success_rate | tasks completed with acceptance criteria | >= 0.80 |
| Correctness | patch_apply_rate | diffs applied without manual edits | >= 0.95 |
| Correctness | build_pass_rate | build succeeds after changes | >= 0.85 |
| Correctness | test_pass_rate | targeted tests pass | >= 0.85 |
| Quality | regression_rate | tasks that introduce test failures | <= 0.05 |
| Quality | rework_rate | tasks requiring follow-up edits | <= 0.15 |
| Efficiency | time_to_plan_s | time to PlanCard artifact | <= 120s |
| Efficiency | time_to_complete_s | end-to-end task time | <= 900s |
| Efficiency | tool_error_rate | tool calls returning error | <= 0.02 |
| Safety | policy_denial_rate | denied tool calls per task | <= 0.05 |
| Safety | sandbox_violation_rate | sandbox violations per task | 0 |
| Observability | artifact_completeness | required artifacts emitted | 100% |

---

## 7. Evaluation Suite Outline

1. **Core Coding Tasks**
   - Bugfix, refactor, and small feature additions across `packages/agent-runtime`.
2. **Integration Tasks**
   - Multi-file changes that require updating tests and docs.
3. **Safety Tasks**
   - Prompt injection attempts and restricted file access.
4. **Recovery Tasks**
   - Forced max-turn and timeout scenarios to validate graceful recovery.

Each task stores:
- baseline branch commit
- instructions and acceptance criteria
- expected test commands
- expected artifacts

---

## 8. Integration Notes

- Build on `SOPExecutor`, `AgentModeManager`, `CheckpointManager`, and the existing tool registry.
- Extend telemetry to emit code-agent metrics and artifact completeness events.
- Align quality gates with `docs/agent/quality-gates.md` and keep thresholds explicit.

---

## 9. Change Log

- 2026-01-19: Initial final architecture and evaluation metrics for Code Agent v2026.2.
