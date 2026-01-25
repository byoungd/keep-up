# Track AU: Local-First Data and Audit (Rust)

> Priority: P0
> Status: Completed (PR #260)
> Owner: Data Platform Team
> Dependencies: Phase 6 storage engine
> Estimated Effort: 2 weeks

---

## Overview

Implement a Rust-first local data store for agent runs, tool configs, provider configs,
and audit logs. This track ensures local-first privacy with a clean persistence layer
shared by the runtime and UI.

## Architecture Context

- Product context: Open Wrap. This track targets runtime persistence only.
- Runtime boundary: Rust owns storage, migrations, and encryption.
- TypeScript consumes query APIs for UI presentation and reporting.

## Scope

- Local storage for tasks, chat history, tool configs, and model configs.
- Audit log schema for tool, model, and workspace events.
- Data retention and export hooks.
- Encryption at rest and redaction for secrets.

## Out of Scope

- Cloud sync or multi-device replication.
- LFCC or editor document storage (handled by LFCC/Loro stack).
- Full-text search indexing.

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

## Implementation Spec (Executable)

This section is the authoritative execution guide. Follow it exactly to implement Track AU.

### 1) Data Model and Serialization

All JSON payloads use `camelCase` fields. Enums are serialized as `snake_case`.

Rust types (serialize/deserialize with `serde`):

- `TaskRun { run_id, goal, status, started_at, ended_at?, metadata? }`
- `ToolEvent { event_id, run_id, tool_id, input_hash, output_hash, duration_ms, created_at }`
- `ModelEvent { event_id, run_id, provider_id, model_id, input_tokens, output_tokens, total_tokens, cost_usd?, created_at }`
- `WorkspaceEvent { event_id, session_id, kind, payload_hash, created_at }`
- `SecretRecord { key, encrypted_payload, created_at, updated_at }`
- `ExportBundle { task_runs[], tool_events[], model_events[], workspace_events[] }`

Enum values:
- `TaskRunStatus`: queued | running | completed | failed | canceled
- `WorkspaceEventKind`: session_started | session_ended | approval_requested | approval_resolved

### 2) Storage Layout

- Use `storage-engine-rs` to create a single SQLite DB per workspace.
- DB path is provided by config: `PersistenceConfig { db_path, encryption_key_ref? }`.
- Apply migrations on open; migration versions are deterministic and idempotent.

### 3) Encryption and Redaction

- Secrets are stored in `SecretRecord.encrypted_payload` using AES-256-GCM.
- Encryption key is loaded from `encryption_key_ref` (Track AU config) and never logged.
- Audit export redacts secrets and stores only hashes.
- Hashes are SHA-256 hex.

### 4) Public API (Rust + TS)

Expose N-API class `PersistenceStore`:

- `open(config)`
- `saveTaskRun(taskRun)`
- `updateTaskRunStatus(runId, status, endedAt?)`
- `listTaskRuns(filter?) -> TaskRun[]`
- `saveToolEvent(toolEvent)`
- `saveModelEvent(modelEvent)`
- `saveWorkspaceEvent(workspaceEvent)`
- `storeSecret(key, plaintext)`
- `loadSecret(key) -> plaintext | null`
- `exportBundle(filter?) -> ExportBundle`
- `reset()`

Node loader:
- `@ku0/agent-runtime-persistence/node` uses `@ku0/native-bindings`.
- Env overrides: `KU0_PERSISTENCE_NATIVE_PATH` and `KU0_PERSISTENCE_DISABLE_NATIVE=1`.
- Required export: `PersistenceStore`.

### 5) Integration Points

- `packages/agent-runtime-execution` writes task runs and tool/model events.
- `packages/agent-runtime-control` reads summaries for UI and exports.
- `packages/agent-runtime-tools` writes tool audit events from Track AQ.

### 6) Tests (Required)

Rust unit tests:
- Migrations apply cleanly and are idempotent.
- Secrets round-trip with encryption on and off.
- Export bundle redacts secrets and outputs hashes only.

TypeScript validation:
- `packages/agent-runtime-persistence` build passes with native bindings.

### 7) Validation Commands

- `cargo test` (in `packages/agent-runtime-persistence/native`)
- `pnpm -C packages/agent-runtime-persistence build`
- `pnpm biome check --write`

### 8) Definition of Done

- Local DB stores task, tool, model, and workspace events.
- Secrets are encrypted at rest and never logged.
- Export bundle produces redacted JSON.
- TypeScript runtime can read/write via native binding.

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
