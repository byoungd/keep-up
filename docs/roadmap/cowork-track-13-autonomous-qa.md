# Track 13: Autonomous QA + Preflight Gates

> [!NOTE]
> **Dependency on Phase F (Track 15)**
> While the core logic of this track (lint/test parsers) can be built now, the *autonomous* aspect relies heavily on the "Background Jobs" capability from the **Phase F Swarm Runtime**. 
> - **Event Streaming**: QA Agents must use the **V2 Event Bus** (Recursive Event Bubbling) to stream real-time progress to the UI.
> - **Recommendation**: Build parsers now; integrate execution loop after Track 15 (F2) lands.


## Mission
Increase trust in agent output by running preflight checks that catch regressions
before changes are finalized.

## Primary Goal
Ship a preflight pipeline that selects and runs relevant checks (lint, typecheck,
tests) and produces a report artifact.

## Background
Top products (Cursor, Devin, Claude Code) reduce risk by running validation steps
and surfacing results before users accept changes. This creates a safer loop for
autonomous edits.

## Scope
- Preflight pipeline with lint, typecheck, and targeted tests.
- Change-aware test selection heuristics.
- Preflight report artifact stored with session.
- UI summary with pass/fail and actionable errors.
- Configurable allowlist of commands.

## Non-Goals
- Full CI replacement.
- Auto-fixing failing tests without user review.

## Inputs and References
- Track 4 (approvals + policy enforcement)
- Track 5 (telemetry)
- `apps/cowork/server/runtime/coworkTaskRuntime.ts`

## Execution Steps (Do This First)
1. Define report schema:
   ```ts
   interface PreflightReport {
     id: string;
     sessionId: string;
     checks: Array<{ name: string; status: "pass" | "fail"; output: string }>;
     riskSummary: string;
     createdAt: number;
   }
   ```
2. Add command allowlist and approval checks.
3. Implement change-aware check selection (files -> lint/typecheck/tests).
4. Store report as an artifact with status.
5. Add UI summary and download link.

## Required Behavior
- Preflight runs only approved commands.
- Preflight runs only in Build Mode; Plan Mode must block execution and suggest switching modes.
- Report is attached to the session and diff artifacts.
- Failures do not block manual override but require confirmation.
- Results are visible in the message timeline.
- When the Phase G sandbox runtime is enabled, run checks inside the sandbox execution path.

## Implementation Outline
1. Add preflight runner in agent-runtime.
2. Add `POST /api/preflight` endpoint to trigger runs.
3. Store reports in artifact store with `type: "preflight"`.
4. Add UI in Cowork to view results.
5. Emit telemetry for pass/fail and duration.

## Deliverables
- Preflight runner with allowlist.
- Report storage and retrieval endpoints.
- UI for report viewing.
- Telemetry events for preflight outcomes.

## Acceptance Criteria
- [ ] Lint/typecheck run on demand with a report artifact.
- [ ] Report links to failing files and commands.
- [ ] Users can approve or rerun failed checks.
- [ ] Telemetry records duration and failures.

## Testing
- Unit tests for selection logic.
- Integration tests for report storage and API.
- `pnpm vitest run --project cowork-server`

## Dependencies
- Track 4 for approvals.
- Track 5 for telemetry.
- Track 9 for Build Mode gating.
- Track 15 (Phase F2) for background jobs + V2 event bus in autonomous runs.

## Owner Checklist
- Follow `CODING_STANDARDS.md`.
- Update `task.md` progress markers.
- Document manual verification steps in `walkthrough.md`.
