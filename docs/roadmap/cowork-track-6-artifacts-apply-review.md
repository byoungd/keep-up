# Track 6: Artifact Review + Apply Workflow

## Mission
Provide a complete output lifecycle: preview, apply, rollback, and revision
request for task deliverables.

## Primary Goal
Make artifacts actionable and auditable with a clear review flow.

## Scope
- Inline preview for diff and report artifacts.
- Apply and rollback for diff artifacts.
- Artifact version history per task.
- Action log entries for applied changes.
- UI controls for approve/apply/revert.

## Non-Goals
- Building a full git client UI.
- Cross-session artifact sharing.

## Inputs and References
- `apps/cowork/src/features/artifacts/components/*`
- `apps/cowork/server/storage/sqliteArtifactStore.ts`
- `docs/specs/cowork/cowork-top-tier-agent-chat-spec.md`

## Required Behavior
- Each artifact has a stable id and version.
- Apply action updates storage and emits an audit entry.
- Rollback restores previous state or reverts diff.
- Artifacts remain discoverable in the Library view.

## Implementation Outline
1. Add artifact version tracking and apply status.
2. Build apply/revert endpoints in cowork server.
3. Wire UI buttons to apply/revert actions.
4. Persist action logs for applied artifacts.
5. Provide clear error states for failed apply.

## Deliverables
- Apply/revert API endpoints.
- UI workflow for artifact review and actions.
- Audit log entries for artifact actions.

## Acceptance Criteria
- Diff artifacts can be applied and reverted.
- Applied artifacts show updated status and timestamp.
- Failures provide actionable error messages.

## Testing
- `pnpm vitest run --project cowork-server`
- `pnpm test:e2e:features`

## Dependencies
- Track 1 for message history integration.
- Track 3 for inline deliverable placement.

## Owner Checklist
- Follow `CODING_STANDARDS.md` (TypeScript only, no `any`, no `var`).
- Update `task.md` progress markers for this track.
- Document manual verification steps in `walkthrough.md`.
