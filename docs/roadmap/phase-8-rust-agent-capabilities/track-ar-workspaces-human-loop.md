# Track AR: Workspace Sessions and Human Loop (Rust)

> Priority: P1
> Status: Proposed
> Owner: Desktop Platform Team
> Dependencies: Phase 7 Tauri shell, Track AQ gateway
> Estimated Effort: 3 weeks

---

## Overview

Deliver Rust-native workspace sessions for browser, terminal, and file views with
human-in-the-loop approvals. This track provides the live execution surfaces that
agents and users share while tasks are running.

## Scope

- Workspace session types: terminal, browser, file viewer.
- Live stream of UI state and logs to `apps/cowork`.
- Take control and handoff between agent and user.
- Approval prompts for sensitive actions and script execution.

## Deliverables

- `packages/workspace-session-rs/` crate for session lifecycle and streaming.
- PTY and browser automation bindings secured by sandbox policy.
- Approval workflow API for human-in-the-loop events.
- UI bridge for session attach, detach, and replay.

## Technical Design

### Core Types

- `WorkspaceSession`: id, kind, status, owner_agent_id.
- `WorkspaceEvent`: stdout, dom_snapshot, screenshot, log_line.
- `ApprovalRequest`: action, risk_level, context_hash.
- `ApprovalDecision`: approve | deny | edit.

### Execution Flow

1. Agent requests a workspace session from Rust runtime.
2. Runtime streams updates to UI via event channel.
3. Risky actions emit approval requests to UI.
4. Approved actions resume execution and persist audit events.

### Rust-First Boundary

- Rust owns session state, streaming, and approval gating.
- TypeScript renders workspace UI and posts user decisions.

## Implementation Plan

| Week | Focus | Outcomes |
| :--- | :--- | :--- |
| 1 | Session lifecycle | terminal and file sessions, streaming format |
| 2 | Browser automation | automation hooks, screenshot pipeline |
| 3 | Human loop | approval API, replay and audit events |

## Affected Code

- `packages/tooling-session/`
- `packages/shell/`
- `packages/agent-runtime-control/`
- `packages/workspace-session-rs/` (new)
- `apps/cowork/`

## Acceptance Criteria

- Launch terminal and browser sessions with live streaming.
- User can take control and return control to agent.
- Approval requests block risky actions until resolved.
- Session logs and approvals are persisted locally.

## Risks

- Cross-platform PTY edge cases on Windows.
- Browser automation stability and performance.

## References

- `.tmp/analysis/eigent/docs/core/concepts.md`
- `.tmp/analysis/eigent/docs/core/workforce.md`
- `.tmp/analysis/eigent/src/i18n/locales/en-us/setting.json`
