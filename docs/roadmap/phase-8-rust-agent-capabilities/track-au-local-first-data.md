# Track AU: Local-First Data and Audit (Rust)

> Priority: P0
> Status: Proposed
> Owner: Data Platform Team
> Dependencies: Phase 6 storage engine
> Estimated Effort: 2 weeks

---

## Overview

Implement a Rust-first local data store for agent runs, tool configs, provider configs,
and audit logs. This track ensures local-first privacy with a clean persistence layer
shared by the runtime and UI.

## Scope

- Local storage for tasks, chat history, tool configs, and model configs.
- Audit log schema for tool, model, and workspace events.
- Data retention and export hooks.
- Encryption at rest and redaction for secrets.

## Deliverables

- `packages/agent-runtime-persistence/` Rust-backed store integration.
- Schema for `TaskRun`, `ToolEvent`, `ModelEvent`, `WorkspaceEvent`.
- Export API for redacted audit bundles.
- Migration tooling and local backup strategy.

## Technical Design

### Core Types

- `TaskRun`: id, goal, status, started_at, ended_at.
- `ToolEvent`: tool_id, action, input_hash, output_hash.
- `ModelEvent`: provider, model_id, tokens_in, tokens_out.
- `WorkspaceEvent`: session_id, kind, approval_id.

### Rust-First Boundary

- Rust owns storage, migrations, and encryption.
- TypeScript consumes query APIs for UI presentation.

## Implementation Plan

| Week | Focus | Outcomes |
| :--- | :--- | :--- |
| 1 | Schema and persistence | migrations, indices, query APIs |
| 2 | Audit and export | redaction, export bundles, retention policies |

## Affected Code

- `packages/agent-runtime-persistence/`
- `packages/storage-engine-rs/`
- `packages/agent-runtime-memory/`

## Acceptance Criteria

- All task, tool, model, and workspace events persist locally.
- Secrets are encrypted at rest and never stored in plaintext.
- Export produces a redacted audit bundle with hashes only.
- Offline mode works without cloud dependencies.

## Risks

- Schema drift between runtime and UI.
- Data volume growth without retention enforcement.

## References

- `.tmp/analysis/eigent/server/README_EN.md`
- `.tmp/analysis/eigent/src/i18n/locales/en-us/setting.json`
