# Track A: Completion and Recovery Contracts

Owner: Tech Lead + Runtime Developer
Status: Completed

## Objective
Implement the Completion and Recovery contracts as defined in docs/specs/agent-runtime-spec-2026.md Section 5.1 and 5.2.

## Scope
- Completion tool contract with schema validation
- Recovery engine with final warning turn and grace limits
- Error state transitions when completion is missing

## Non-Goals
- Tool governance policies (Track B)
- Checkpoint persistence (Track C)

## Responsibilities
- TL: confirm contract semantics and edge cases
- Dev: implement orchestrator and tool changes
- QA: validate recovery scenarios and error states

## Key Deliverables
- Completion tool definition and schema
- Orchestrator enforcement for completion-only termination
- Recovery engine logic and tests
- Event emission for recovery and completion

## Tasks
1. Add completion tool contract and schema validation
2. Enforce completion-only termination in orchestrator
3. Implement final warning recovery turn with grace timeout
4. Emit recovery and completion events

## Acceptance Criteria
- Any task that terminates without completion is ERROR
- Recovery turn is injected at limit conditions and calls completion only
- Completion tool called alone in its turn
- Unit tests cover success, missing completion, and recovery cases

## Required Tests
- Unit tests for completion enforcement and recovery injection
- Targeted integration test for limit-reached scenario

## Branch and PR Workflow
- Create branch: feature/track-a
- Run required tests, commit, open PR
