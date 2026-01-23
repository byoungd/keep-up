# Phase 8: Rust-First Agent Capabilities - Implementation Tracker

> **Status**: Active Planning / Ready for Implementation (Partial)
> **Timeline**: Q4 2027
> **Tracking**: This file tracks the granular execution of Phase 8.

## Prerequisites & Dependencies

- [x] **Phase 6: Rust Native**: `sandbox-rs`, `storage-engine-rs` available.
- [x] **Phase 7: Desktop Sovereignty**: Required for Track AR (Tauri Shell).
  - *Note: Tracks AP, AQ, AS, AT, AU can proceed in parallel with Phase 7.*

## Track Checklist

### Track AP: Workforce Orchestrator (Rust) [P0]
**Goal**: `packages/agent-workforce-rs`
- [x] **Week 1: Core Data Model**
  - [x] Scaffold `packages/agent-workforce-rs` crate.
  - [x] Define `TaskGraph` struct (nodes, edges, dependencies).
  - [x] Define `TaskStatus` state machine enum.
  - [x] Implement `EventLog` struct for deterministic history.
- [x] **Week 2: Scheduling**
  - [x] Implement `Planner` trait and mock implementation.
  - [x] Implement `Coordinator` struct for capability matching.
  - [x] Add `Scheduler` logic for topological sort of tasks.
- [x] **Week 3: Reliability**
  - [x] Implement `FailurePolicy` (retry, backoff).
  - [x] Add Dead Letter Queue (DLQ) for permanently failed tasks.
  - [x] Integrate with `agent-runtime-control` (FFI).

### Track AQ: Tool and MCP Gateway (Rust) [P0]
**Goal**: `packages/tool-gateway-rs`
- [ ] **Week 1: Registry**
  - [ ] Scaffold `packages/tool-gateway-rs` crate.
  - [ ] Define `ToolSpec` and `MCPManifest` structs.
  - [ ] Implement partial manifest loader (JSON).
- [ ] **Week 2: Execution**
  - [ ] Integrate `sandbox-rs` for isolation.
  - [ ] Implement `ToolInvocation` struct and handler.
  - [ ] Wire up `ToolResult` return types.
- [ ] **Week 3: Policy**
  - [ ] Define `CapabilityGrant` struct.
  - [ ] Implement `PolicyEngine` trait (allow/deny/ask).
  - [ ] Add Audit Logging hooks.

### Track AU: Local-First Data and Audit (Rust) [P0]
**Goal**: `packages/agent-runtime-persistence` (Rust-backed)
- [ ] **Week 1: Persistence**
  - [ ] Integrate `storage-engine-rs`.
  - [ ] Define schemas for `TaskRun`, `ToolEvent`.
  - [ ] Implement `PersistenceStore` trait.
- [ ] **Week 2: Audit**
  - [ ] Implement `AuditLog` writer with encryption.
  - [ ] Add `ExportBundle` generator (redacted JSON).

### Track AS: Model Fabric and Routing (Rust) [P1]
**Goal**: `packages/model-fabric-rs`
- [ ] **Week 1: Registry**
  - [ ] Scaffold `packages/model-fabric-rs`.
  - [ ] Define `ProviderConfig` (OpenAI, Anthropic, Local).
- [ ] **Week 2: Routing**
  - [ ] Implement `Router` struct (model selection logic).
  - [ ] Add HTTP Client integration (using reqwest/process-pool).
  - [ ] Add Telemetry hooks (token usage).

### Track AT: Agent Toolkit Library (Rust) [P1]
**Goal**: `packages/agent-toolkit-rs`
- [ ] **Week 1: IO Toolkits**
  - [ ] Scaffold `packages/agent-toolkit-rs`.
  - [ ] Implement `FileToolkit` (safe read/write).
  - [ ] Implement `NoteToolkit`.
- [ ] **Week 2: Docs**
  - [ ] Implement `MarkdownConverter`.
  - [ ] Implement `DocumentGen` (PPTX/XLSX stubs).
- [ ] **Week 3: Media**
  - [ ] Implement `MediaAnalyzer` trait.
  - [ ] Add `WebDeploy` preview server.

### Track AR: Workspace Sessions (Rust) [P1]
*Blocked by Phase 7 (Tauri Shell)*
- [ ] **Week 1: Session Lifecycle**
  - [ ] Scaffold `packages/workspace-session-rs`.
  - [ ] Define `Session` (Terminal/Browser/File).
- [ ] **Week 2: Automation**
  - [ ] Implement PTY bridge.
  - [ ] Implement Browser automation hooks.
- [ ] **Week 3: Human Loop**
  - [ ] Add `ApprovalRequest` flow.

## Verification
- [ ] All new crates must compile with `cargo check`.
- [ ] All new crates must pass `cargo test`.
- [ ] Integration consistency check with `packages/agent-runtime-*`.
