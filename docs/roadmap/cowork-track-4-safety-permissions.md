# Track 4: Safety + Permissions (Cowork Compliance)

## Mission
Deliver Cowork-grade safety and permissions with explicit grants, risk tags,
confirmation UX, and auditability.

## Primary Goal
Provide a clear, enforced permission model that matches Cowork safety expectations
and is visible in the UI.

## Scope
- Folder grant enforcement for file read/write/create/delete.
- Network and connector access checks with risk tags.
- Approval workflow with reason and risk labels.
- Audit log persistence per task and session.
- UI visibility of grants and pending approvals.

## Non-Goals
- Replacing the agent runtime kernel.
- Full enterprise policy management.

## Inputs and References
- `docs/specs/cowork/cowork-safety-spec.md`
- `docs/specs/cowork/cowork-policy-dsl.md`
- `docs/specs/cowork/cowork-sandbox-design.md`
- `apps/cowork/server/runtime/coworkTaskRuntime.ts`
- `apps/cowork/server/services/approvalService.ts`

## Required Behavior
- Every tool call is validated against grants and risk tags.
- Destructive actions require explicit approval.
- Approvals are surfaced inline with clear reason and scope.
- Audit logs are persisted and queryable per session/task.

## Implementation Outline
1. Enforce grant-aware path validation and output roots.
2. Wire Policy DSL into permission checks for file/network/connector.
3. Expand approval payload with risk tags + reason in UI.
4. Persist audit logs alongside task summaries.
5. Add UI panel for grants and recent approvals.

## Deliverables
- Policy enforcement in tool execution path.
- Approval UI with structured risk/impact display.
- Audit log storage and API.

## Acceptance Criteria
- Out-of-scope file access is blocked.
- High-risk actions require approval before execution.
- Audit logs list each tool action with timestamp and outcome.

## Testing
- `pnpm vitest run --project cowork-server`
- Add unit tests for policy + approval rules.

## Dependencies
- Track 1 message schema alignment for approval UI metadata.

## Owner Checklist
- Follow `CODING_STANDARDS.md` (TypeScript only, no `any`, no `var`).
- Update `task.md` progress markers for this track.
- Document manual verification steps in `walkthrough.md`.
