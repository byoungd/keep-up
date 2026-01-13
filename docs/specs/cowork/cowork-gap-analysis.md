# Cowork Gap Analysis vs agent-runtime (Phase 4)

## Purpose
Map Claude Desktop Cowork requirements to existing agent-runtime modules, identify gaps, and propose integration points.

## Cowork Requirements (Summary)
- Task mode with plan, subtasks, and long-running execution.
- Folder-scoped file access with explicit user grants and confirmations.
- Clear confirmation prompts for high-impact actions.
- Parallel subagents with inherited permissions.
- Connector/extension trust and scoped access.
- Local execution in desktop app with explicit user control.
- No cross-session memory or project context.

## Existing agent-runtime Modules
- Session state: `packages/agent-runtime/src/session/index.ts`.
- Planning engine: `packages/agent-runtime/src/orchestrator/planning.ts`.
- Orchestrator and confirmation hooks: `packages/agent-runtime/src/orchestrator/orchestrator.ts`.
- Task queue types: `packages/agent-runtime/src/tasks/types.ts`.
- Subagent tools: `packages/agent-runtime/src/tools/core/subagent.ts`.
- Security policy + permission checker: `packages/agent-runtime/src/security/index.ts`.
- File tool and path validator: `packages/agent-runtime/src/tools/core/file.ts`.
- MCP registry and tools: `packages/agent-runtime/src/tools/mcp/registry.ts`.
- Audit logging: `packages/agent-runtime/src/security/index.ts` (InMemoryAuditLogger).

## Gaps and Required Changes
### Session + Grants
- Gap: no CoworkSession or folder grant concept; security policy uses coarse `fsIsolation` and `workingDirectory` only.
- Impact: cannot enforce per-session folder grants or output roots.
- Integration: extend SessionState and SecurityPolicy with grant metadata, or add CoworkSession wrapper above SessionState.

### Confirmation + Risk Tags
- Gap: confirmations are boolean with `requiresConfirmation`, no structured risk tags or step-level approvals.
- Impact: cannot deliver Cowork-style confirm prompts with reasons and risk categories.
- Integration: add confirmation contract and risk tags per tool call, mapping to Cowork confirmation events.

### Policy DSL
- Gap: PermissionChecker uses static rules; no DSL-driven evaluation or decision reasons.
- Impact: cannot encode nuanced allow/confirm/deny decisions for paths, connectors, or network hosts.
- Integration: implement PolicyEngine backed by the Cowork Policy DSL and wire into PermissionChecker and tools.

### File Access Enforcement
- Gap: PathValidator does not resolve real paths or enforce output roots; symlink escapes not blocked.
- Impact: risk of path traversal or accidental write outside grants.
- Integration: add sandbox adapter (see `docs/cowork-sandbox-design.md`) and replace validator with grant-aware resolver.

### Task Mode + Long-Running Tasks
- Gap: Planning engine exists, but no explicit Cowork task lifecycle or task summary model.
- Impact: cannot represent queued/running/completed Cowork tasks with summary artifacts.
- Integration: map orchestrator runs to TaskQueue entries and persist TaskSummary outputs.

### Subagent Permissions
- Gap: subagents can be spawned but no explicit permission inheritance or scope restrictions.
- Impact: subagents could access tools beyond the parent task intent.
- Integration: pass session grants + policy to subagent context; restrict tool registry by scope.

### Connector Trust + Scope
- Gap: MCP registry lacks explicit trust registry or connector scope enforcement.
- Impact: no explicit opt-in or scoping for connectors/actions.
- Integration: introduce connector grant model and guard connector action tools.

### Audit + Reporting
- Gap: Audit logger is in-memory only; no TaskSummary aggregation.
- Impact: cannot provide Cowork-style action logs and outputs.
- Integration: persist audit logs per task and emit TaskSummary compatible with `docs/cowork-api-contracts.md`.

### Memory Constraints
- Gap: memory manager exists with no enforced Cowork restriction (no cross-session memory).
- Impact: Cowork parity requires memory off by default.
- Integration: disable memory manager or make it session-scoped and non-persistent for Cowork mode.

## Proposed Module Mapping
- CoworkSession + grants: new module alongside `session` or wrapper that builds SecurityPolicy with grants.
- Policy DSL: new policy engine implementation using `docs/cowork-policy-dsl.md` wired into `security`.
- Sandbox adapter: new adapter wrapping file + bash + code tools per `docs/cowork-sandbox-design.md`.
- Task lifecycle: map to `tasks` module and add CoworkTask contract.
- Confirmation broker: adapter to provide risk-tagged confirmations.
- Connector trust: registry layer near `tools/mcp/registry.ts`.

## Priority Gaps (Phase 4)
1. Policy DSL + sandbox adapter integration for file/network actions.
2. CoworkSession with folder grants and output roots.
3. Task lifecycle + summary logging.
4. Connector trust + scoped grants.

## Open Questions
- Should CoworkSession live inside session state or be a parallel runtime context?
- Where should TaskSummary persistence live (telemetry vs task queue vs new store)?
- How should connector scopes be expressed to align with MCP capabilities?
