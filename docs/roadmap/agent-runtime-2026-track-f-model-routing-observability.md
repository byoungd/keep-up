# Track F: Model Routing, Context, and Observability

Owner: Runtime Developer + QA
Status: Completed

## Objective
Implement model routing, context management, and observability contracts per docs/specs/agent-runtime-spec-2026.md Sections 5.6, 5.7, and 5.11.

## Scope
- ModelRouter with fallback behavior
- ContextManagement logic (compression loop)
- Event emission for key runtime events
- Trace integration for tool calls and decisions

## Non-Goals
- Checkpoint persistence (Track C)
- Tool governance policy enforcement (Track B)

## Responsibilities
- Dev: ModelRouter and event emission
- QA: verify event coverage and fallback behavior

## Key Deliverables
- ModelRouter with per-turn resolution
- Event emission for turn, tool, recovery, completion, error
- Tests for event coverage and routing fallback

## Tasks
1. Implement ModelRouter decision logic
2. Emit routing decisions into EventLog
3. Implement ContextManager with compression and preservation rules
4. Add event emission points in orchestrator
5. Add tests for routing, context, and events

## Acceptance Criteria
- Model routing resolves before each LLM call
- Context compression triggers at threshold limit
- Compressed context preserves system prompt and N user messages
- Fallback is applied on routing failure
- Event stream contains required event types and fields

## Required Tests
- Unit tests for routing decisions and fallback
- Integration test for event emission sequence

## Branch and PR Workflow
- Create branch: feature/agent-runtime-2026-track-f
- Run required tests, commit, open PR
