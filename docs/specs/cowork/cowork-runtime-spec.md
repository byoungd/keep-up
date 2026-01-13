# Cowork Runtime Spec (Phase 2)

## Purpose
Define the runtime behavior required to align Keep-Up agent-runtime with Cowork task mode, without code changes.

## Goals
- Task mode lifecycle: plan -> subtask -> execute -> summary.
- Parallel subagent coordination and long-running execution.
- User steering and task queueing during execution.
- No cross-session memory in Cowork mode.

## Non-Goals
- UI implementation details.
- Full desktop app integration (documented separately).

## Session Model
### CoworkSession
- **Identity**: session_id, user_id, device_id, platform (macOS).
- **Mode**: cowork (strictly separate from chat mode).
- **Memory**: session-scoped only; no cross-session persistence.
- **Scope**: folder grants + connector grants; enforced on every tool call.

### Session Lifecycle
1. `session.start` with declared grants and platform metadata.
2. Task submissions are queued and executed.
3. `session.end` clears all session memory and in-flight grants.

## Task Lifecycle
### States
- `queued` -> `planning` -> `ready` -> `running` -> `awaiting_confirmation` -> `running` -> `completed` | `failed` | `cancelled`.

### Required Artifacts
- **Plan**: structured steps with dependencies and risk tags.
- **Subtasks**: optional parallel units with scoped tool permissions.
- **Summary**: final report + list of produced files + action log.

### User Steering
- Users can inject new guidance at any time; the agent must:
  - acknowledge the update,
  - re-plan if needed,
  - continue with updated scope.

## Subagent Coordination
- Subagents are spawned only within CoworkSession.
- Each subagent inherits session grants and a reduced tool set.
- Subagents report partial outputs to the parent for synthesis.

## Long-Running Tasks
- Tasks may exceed normal chat limits without timeout.
- TaskQueue must support pause/resume/cancel.
- Progress updates must be emitted at stable intervals.

## Event Vocabulary (Draft)
### Session Events
- `session.start`, `session.end`, `session.error`

### Task Events
- `task.queued`, `task.planning`, `task.plan_ready`, `task.running`
- `task.confirmation_required`, `task.confirmation_received`
- `task.progress`, `task.completed`, `task.failed`, `task.cancelled`

### Subagent Events
- `subagent.spawned`, `subagent.completed`, `subagent.failed`

### Tool Events
- `tool.call`, `tool.result`, `tool.error`

## Data Contracts (Draft)
### TaskPlan
- id, steps[], dependencies[], risks[], estimated_actions[]

### TaskSummary
- outputs[], file_changes[], action_log[], followups[]

## Open Questions
- What granularity is required for progress updates (per step vs time-based)?
- Do we allow nested subagent trees or a single level only?
- How should the runtime handle user steering that conflicts with an in-flight tool call?
