# Track AR: Workspace Sessions and Human Loop (Rust)

> Priority: P1
> Status: Proposed
> Owner: Desktop Platform Team
> Dependencies: Phase 7 Tauri shell, Track AQ gateway, Track AU storage
> Estimated Effort: 3 weeks

---

## Overview

Deliver Rust-native workspace sessions for browser, terminal, and file views with
human-in-the-loop approvals. This track provides the live execution surfaces that
agents and users share while tasks are running, with reliable streaming, control
handoff, and auditable decisions.

## Architecture Context

- Product context: Open Wrap. Sessions stream from runtime to `apps/cowork`.
- Runtime boundary: Rust owns session lifecycle, streaming, and approval gating.
- TypeScript renders sessions, captures user input, and posts decisions back.

## Scope

- Workspace session types: terminal (PTY), browser automation, file viewer.
- Ordered event stream of UI state and logs to `apps/cowork` with backfill support.
- Exclusive control handoff between agent and user (input gating while blocked).
- Approval prompts for sensitive actions, with edit/deny and timeout handling.
- Local persistence of session events for replay and audit.

## Out of Scope

- Full remote desktop streaming.
- Mobile UI support.
- Cloud-hosted sessions.

## Deliverables

- `packages/workspace-session-rs/` crate for session lifecycle, event streaming,
  and backfill.
- PTY and browser automation bindings secured by sandbox policy.
- Approval workflow API and policy hooks for human-in-the-loop events.
- Event persistence and replay integration with local-first storage.
- UI bridge for session attach, detach, control transfer, and replay.

## Technical Design

### Core Types

- `WorkspaceSession`: id, workspace_id, kind, status, owner_agent_id, controller_id.
- `WorkspaceSessionKind`: terminal | browser | file.
- `WorkspaceSessionStatus`: requested | running | paused | blocked | ended | errored.
- `WorkspaceEvent`: seq, ts, session_id, kind, payload, source.
- `WorkspaceEventKind`: terminal_stdout | terminal_stderr | terminal_exit
  | dom_snapshot | screenshot | file_snapshot | file_diff | log_line
  | control_handoff | approval_request | approval_decision.
- `ApprovalRequest`: id, session_id, action, risk_level, context_hash, expires_at.
- `ApprovalDecision`: approve | deny | edit, resolved_by, resolved_at.

### Streaming and Replay

- Event stream is ordered with a monotonic `seq` and supports backfill by cursor.
- High-frequency updates (terminal output, screenshots) are batched and throttled.
- Replay is driven by persisted events with bounded retention policies.

### Control Model

- A single controller holds input focus at a time (agent or user).
- Control handoff emits events and pauses agent execution while user controls.
- Resume requires explicit handback and audit logging.

### Approval Pipeline

- Risk classification gates actions (auto, ask, deny).
- Requests include context hashes and expire to avoid stuck sessions.
- Decisions are persisted and replayable alongside session events.

### Execution Flow

1. Agent requests a workspace session from the Rust runtime.
2. Runtime streams ordered events to UI with backfill support.
3. Risky actions emit approval requests and block execution.
4. Decisions and control handoff are applied, logged, and replayable.

### Rust-First Boundary

- Rust owns session state, streaming, gating, and audit persistence.
- TypeScript renders workspace UI and posts user decisions and control actions.

## Implementation Spec (Executable)

This section is the authoritative execution guide. Follow it exactly to implement Track AR.

### 1) Data Model and Serialization

All JSON payloads use `camelCase` fields. Enums are serialized as `snake_case`.

Rust types (serialize/deserialize with `serde`):

- `WorkspaceSession { session_id, kind, status, owner_agent_id?, created_at, updated_at }`
- `WorkspaceEvent { sequence, session_id, type, timestamp, payload }`
- `WorkspaceSnapshot { sessions[], event_cursor }`
- `ApprovalRequest { request_id, kind, payload, requested_at, timeout_ms? }`
- `ApprovalDecision { request_id, status, approved, reason? }`

Enum values:
- `WorkspaceKind`: terminal | browser | file
- `WorkspaceStatus`: created | active | paused | closed
- `WorkspaceEventType`: stdout | stderr | prompt | screenshot | dom_snapshot | file_view | log_line | status
- `ApprovalKind`: tool | plan | escalation
- `ApprovalStatus`: pending | approved | rejected | expired

### 2) Session Lifecycle Rules

- `createSession` returns status `created`, then transitions to `active`.
- `pauseSession` moves to `paused`; `resumeSession` moves back to `active`.
- `closeSession` moves to `closed` and emits a terminal `status` event.
- Events are ordered by `sequence` and must be monotonically increasing.

### 3) Event Streaming

- `drainEvents(after?, limit?)` returns events with `sequence > after`.
- Event payloads are small, JSON-serializable, and never include secrets.
- `dom_snapshot` and `screenshot` payloads store asset references, not raw binaries.

### 4) Approvals

- Approval requests are emitted for risky actions and block execution until resolved.
- `requestApproval` creates a record with `pending` status.
- `resolveApproval` updates status and unblocks execution if approved.
- All approval records are logged via Track AU.

### 5) FFI Boundary (Rust <-> Node)

Expose N-API class `WorkspaceSessionManager`:

- `createSession(config) -> WorkspaceSession`
- `pauseSession(sessionId)`
- `resumeSession(sessionId)`
- `sendInput(sessionId, payload)`
- `drainEvents(after?, limit?) -> WorkspaceEvent[]`
- `listSessions() -> WorkspaceSession[]`
- `requestApproval(request) -> ApprovalRequest`
- `resolveApproval(decision) -> ApprovalDecision`
- `getSnapshot() -> WorkspaceSnapshot`
- `reset()`

Node loader:
- `@ku0/workspace-session-rs/node` uses `@ku0/native-bindings`.
- Env overrides: `KU0_WORKSPACE_SESSION_NATIVE_PATH` and `KU0_WORKSPACE_SESSION_DISABLE_NATIVE=1`.
- Required export: `WorkspaceSessionManager`.

### 6) TypeScript Integration

- `packages/agent-runtime-control` wraps the native session manager.
- `apps/cowork` subscribes to session events and posts user input/approval decisions.

### 7) Tests (Required)

Rust unit tests:
- Session lifecycle transitions are valid and ordered.
- Event cursor semantics are monotonic.
- Approval requests block and resume correctly.

TypeScript validation:
- `packages/agent-runtime-control` typecheck passes.

### 8) Validation Commands

- `cargo test` (in `packages/workspace-session-rs`)
- `pnpm -C packages/agent-runtime-control typecheck`
- `pnpm biome check --write`

### 9) Definition of Done

- Sessions can be created, streamed, and closed with deterministic events.
- Approvals are emitted and resolved correctly.
- Native binding is callable from `agent-runtime-control`.
- UI can attach and render sessions with no runtime errors.

## Implementation Plan

| Week | Focus | Outcomes |
| :--- | :--- | :--- |
| 1 | Session lifecycle | session manager, event schema, terminal + file sessions, backfill |
| 2 | Automation | PTY bridge, browser automation adapter, snapshot/screenshot pipeline |
| 3 | Human loop | approval API, control handoff, audit + replay integration |

## Affected Code

- `packages/tooling-session/`
- `packages/shell/`
- `packages/agent-runtime-control/`
- `packages/agent-runtime-persistence/`
- `packages/workspace-session-rs/` (new)
- `apps/cowork/`

## Acceptance Criteria

- Launch terminal, browser, and file sessions with ordered streaming.
- Event streams support backfill and resume after UI reconnect.
- User can take control and return control with exclusive input gating.
- Approval requests block risky actions until resolved or timed out.
- Session logs and approvals are persisted locally and replayable.

## Risks

- Cross-platform PTY edge cases on Windows.
- Browser automation stability and performance.
- High-volume streaming can overwhelm UI without throttling.
- Sensitive data leakage if redaction and policy are incomplete.

## References

- `.tmp/analysis/eigent/docs/core/concepts.md`
- `.tmp/analysis/eigent/docs/core/workforce.md`
- `.tmp/analysis/eigent/src/i18n/locales/en-us/setting.json`
