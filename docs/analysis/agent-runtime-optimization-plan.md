# Agent Runtime Optimization Plan
Date: 2026-01-24
Scope: Open Wrap agent-runtime core agents (packages/agent-runtime*) informed by cross-repo analysis.

## 0) Goals and non-goals
Goals:
- Increase reliability, safety, and determinism of core agent loops.
- Improve multi-agent isolation, governance, and tooling safety.
- Standardize termination, tool concurrency, and context compression.
- Establish a clear, testable policy engine for approvals and safety checks.

Non-goals:
- No UI/UX redesign in apps/cowork for this phase.
- No provider-specific feature forks beyond required compatibility.
- No migration away from Loro or LFCC protocols.

## 1) Current baseline (Open Wrap)
Key runtime modules already exist:
- Orchestrator and loop control: `packages/agent-runtime-execution/src/orchestrator/*`
- Agent manager and profiles: `packages/agent-runtime-execution/src/agents/*`
- Tooling and registries: `packages/agent-runtime-tools/*`
- Security and approvals: `packages/agent-runtime-execution/src/security/*`
- Runtime composition: `packages/agent-runtime-execution/src/runtime.ts`

## 2) Optimization strategy (best-fit approach)
We will phase work to maximize short-term safety gains while laying foundations for deterministic long-running workflows.

### Phase 1 (1–2 sprints): Protocol hardening + safety telemetry
1) Termination protocol enforcement
- Require a completion tool invocation for clean termination (similar to Gemini CLI).
- Define explicit error states when the model stops without completing.
- Update orchestrator error recovery to treat this as recoverable.

2) Subagent isolation defaults
- Default subagents to isolated tool registries with restricted tool sets.
- Enforce schema-validated inputs for subagent calls.
- Add recursion guardrails at orchestrator level (not only manager).

3) Tool concurrency contracts
- Add per-tool concurrency metadata (parallel-safe vs exclusive).
- Enforce locking behavior in ToolScheduler/ToolExecutor.

4) Policy decision telemetry
- Emit structured allow/deny/ask_user events with reason codes.
- Record tool name, argument hashes, and policy rule IDs.

### Phase 2 (3–6 sprints): Policy engine + compression + escalation
5) Unified policy engine
- Implement rule matching on tool name/args with priority ordering.
- Add pluggable safety checkers (in-process + external).
- Standardize “allow/deny/ask_user” decisions with audit trail.

6) Auto-compact strategy
- Introduce a configurable auto-compact policy (context window thresholds).
- Emit compression events and maintain a summary “window” state.

7) Escalation pipeline
- Adopt a Codex-style approval → sandbox → escalate flow.
- Introduce sandbox escalation rules and explicit user prompts.

### Phase 3 (6+ sprints): Deterministic workflows + SOP templates
8) Graph-based orchestration
- Provide a LangGraph-style state graph runtime.
- Durable checkpoints and resumable nodes.

9) SOP and team templates
- Formalize SOPs as reusable “agent playbooks.”
- Provide templates for common software workflows (plan → implement → verify).

10) Multi-agent governance
- Add per-session global budgets for tokens, tools, and cost.
- Introduce lineage-aware limits for nested agents.

## 3) Workstreams mapped to packages
1) Termination protocol enforcement
- `packages/agent-runtime-execution/src/orchestrator/*`
- `packages/agent-runtime-tools` (completion tool schema and validation)

2) Subagent isolation and schema validation
- `packages/agent-runtime-execution/src/agents/*`
- `packages/agent-runtime-tools` (subagent tooling)

3) Tool concurrency contracts
- `packages/agent-runtime-execution/src/orchestrator/smartToolScheduler.ts`
- `packages/agent-runtime-execution/src/executor/*`

4) Policy engine + safety checkers
- `packages/agent-runtime-execution/src/security/*`
- `packages/agent-runtime-core/src/index.ts` (policy-related typings)

5) Auto-compact policy
- `packages/agent-runtime-execution/src/orchestrator/messageCompression.ts`
- `packages/agent-runtime-execution/src/session/*`

6) Escalation pipeline
- `packages/agent-runtime-execution/src/executor/*`
- `packages/agent-runtime-execution/src/security/*`

7) Graph/SOP templates
- `packages/agent-runtime-execution/src/workflows/*`
- `packages/agent-runtime-execution/src/sop/*`

## 4) Milestones and deliverables
Milestone A (end of Phase 1):
- Completion protocol enforced
- Subagent isolation defaults
- Tool concurrency metadata + enforcement
- Policy telemetry events live

Milestone B (end of Phase 2):
- Policy engine with safety checkers
- Auto-compact policy implemented
- Sandbox escalation flow in tool executor

Milestone C (end of Phase 3):
- Graph runtime prototype
- SOP playbook templates
- Multi-agent governance budgets

## 5) Validation plan
- Unit tests for policy engine rules and safety checkers
- Orchestrator tests for termination enforcement
- Tool scheduler tests for concurrency locks
- Compression tests with synthetic long contexts
- Integration tests: subagent calls, escalation flows, and resumable sessions

## 6) Success metrics
- Reduction in “silent stop” terminations (target: <1%)
- Tool failure retry success rate (target: +20%)
- Subagent recursion incidents (target: 0)
- Policy decisions with structured reason coverage (target: 100%)

## 7) Immediate next actions
- Create technical design docs for Termination Protocol and Policy Engine.
- Prototype tool concurrency metadata and enforcement.
- Add telemetry fields for policy decisions and subagent lineage.

