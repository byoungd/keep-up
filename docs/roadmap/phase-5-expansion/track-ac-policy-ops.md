# Track AC: Policy and Ops Governance

Owner: Security Engineer
Status: Completed
Priority: High
Timeline: Month 1-3
Dependencies: AI Envelope, Tool Workbench, Q3 Gym metrics
References: .tmp/analysis/cline/src/core/permissions/CommandPermissionController.ts, .tmp/analysis/opencode/internal/permission/permission.go

---

## Objective

Deliver a policy and audit plane that enforces safe tool usage, prevents
command injection, and provides a durable audit trail for all agent actions.

---

## Source Analysis

- Cline command permission controller blocks shell operators outside quotes and
  enforces allow/deny patterns: `.tmp/analysis/cline/src/core/permissions/CommandPermissionController.ts`.
- OpenCode permission service handles per-session approvals and tool gating:
  `.tmp/analysis/opencode/internal/permission/permission.go`.

---

## Tasks

### AC1: Policy DSL and Rule Evaluation
- Define a policy DSL for allow, deny, and conditional rules.
- Support per-project and global scopes with precedence.
- Provide deterministic evaluation with explicit reasons.
- Enforce `policyAction` presence for all registered MCP tools.

### AC2: Audit and Risk Engine
- Capture tool execution metadata and policy decisions.
- Emit structured audit records for replay and forensics.
- Add a risk score for each request based on tool and context.

### AC3: Enforcement Hooks and CI Gates
- Enforce policy decisions in the tool runtime and AI envelope.
- Fail closed for unknown tools or unrecognized scopes.
- Add CI checks that block merges on policy regression.

---

## Policy Resolution (Authoritative)

Order of precedence:
1. Repo policy file: `.keepup/policy.json`
2. Cowork settings policy
3. Default Cowork policy (`packages/agent-runtime/src/cowork/defaultPolicy.ts`)

Rule evaluation:
- Rules are evaluated in order of specificity: exact action match, then wildcard.
- Within the same specificity tier, rules are evaluated top to bottom.
- First matching rule wins.
- If no rule matches, fallback decision is applied.

---

## Policy DSL Schema (Authoritative)

Format is based on `CoworkPolicyConfig`:
- `version`: `"1.0"`
- `defaults.fallback`: `allow` | `allow_with_confirm` | `deny`
- `rules[]`:
  - `id`
  - `action`: `file.*`, `file.read`, `file.write`, `network.request`, `connector.read`, `connector.action`
  - `when` (optional): `pathWithinGrant`, `pathWithinOutputRoot`, `matchesPattern`, `fileSizeGreaterThan`, `hostInAllowlist`, `connectorScopeAllowed`
  - `decision`
  - `riskTags` (optional)
  - `reason` (optional)

Tool actions are mapped to the closest Cowork action and evaluated with the same engine.
Unknown actions are denied by default.

---

## Tool Action Mapping (Authoritative)

- Each tool must declare `annotations.policyAction` that maps to a `CoworkPolicyAction`.
- If `policyAction` is missing or invalid, the tool call is denied.
- File tools must declare `file.read` or `file.write`.
- Network tools must declare `network.request`.
- Connector tools must declare `connector.read` or `connector.action`.

---

## Policy Storage (Authoritative)

- Repo policy: `.keepup/policy.json` (versioned JSON, workspace-scoped).
- Global policy: stored in Cowork settings and synced to the runtime.
- Export: Cowork UI can export current policy to repo file.
- If repo policy exists, it fully replaces the global policy (no merge).
- Unknown policy `version` results in a deny-all fallback and audit entry.

Glob semantics:
- `*` matches a single path segment.
- `**` matches across path separators.
- Matching uses normalized absolute paths; case-insensitive paths are controlled by Cowork settings.

---

## Risk Scoring (Authoritative)

Risk score range is 0-100. Default weights:
- `delete`: +40
- `overwrite`: +30
- `network`: +25
- `connector`: +20
- `batch`: +15

Score = sum(weights) capped at 100. Denied decisions set score to 100.

---

## Audit Entry Schema (Authoritative)

Each audit entry must include:
- `id`
- `timestamp`
- `sessionId`
- `taskId` (if available)
- `toolName`
- `policyDecision`
- `policyRuleId` (if matched)
- `riskScore`
- `reason`

---

## Deliverables

- Extend `packages/agent-runtime/src/cowork/policy.ts` (DSL parser and evaluator).
- Add policy adapter in `packages/agent-runtime/src/security/` for tool-level enforcement.
- Add `policyAction` to `MCPTool.annotations` in `packages/agent-runtime-core/src/index.ts`.
- Update core tools to declare `annotations.policyAction`.
- `packages/agent-runtime-telemetry/` schema updates for audit records.
- Cowork UI for policy rule management and audit review.
- `packages/agent-gym/benchmarks/q4/` scenarios tagged `policy-safety`.

---

## Scope and Non-Goals

In scope:
- Policy DSL with allow, deny, and conditional rules.
- Immutable audit records for all tool actions.

Not in scope:
- External policy federation or multi-tenant compliance regimes.
- Human approval UI redesign outside Cowork settings.

---

## Acceptance Criteria

- Policy-safety benchmarks deny commands with shell operators outside quotes.
- Allow rules enable safe commands with a traceable audit record.
- Policy evaluation completes under 10ms P95.
- Audit logs are complete and immutable for every tool call.

---

## Integration Points

- `packages/agent-runtime-tools/` policy enforcement and tool metadata.
- `packages/agent-runtime-telemetry/` audit storage and reporting.
- `packages/agent-runtime-core/` AI envelope preflight enforcement.
- `apps/cowork/` policy rule management UI.

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Tool alias bypass | Policy gaps | Canonical tool resolution |
| Overly strict rules | Developer friction | Scoped overrides with expiry |
| Audit volume bloat | Storage pressure | Retention policy and compaction |

---

## Testing

- Unit tests for DSL parsing, rule precedence, and deny behavior.
- Integration tests for enforcement hooks and audit persistence.
- Runtime tests: `pnpm --filter @ku0/agent-runtime test -- --grep "policy"`.
- Gym suite: `pnpm --filter @ku0/agent-gym gym:run -- --suite easy --category policy-safety --benchmarks packages/agent-gym/benchmarks/q4 --report packages/agent-gym/reports/q4-policy-safety.json`.
