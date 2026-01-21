# Track AD: Sandbox Sidecar

> **Priority**: 🔴 P0
> **Status**: Planning
> **Owner**: Agent Runtime Team
> **Dependencies**: None

---

## Overview

Migrate sandbox execution from Docker containers to a Rust sidecar for OS-level process isolation.

### Problem Definition

| Problem | Current Implementation | Impact |
|---------|----------------------|--------|
| Slow container startup | Docker ~500ms | Tool execution latency |
| Path escape risk | `path.resolve` string comparison | Symlink attacks |
| Cross-platform inconsistency | Docker dependency | Windows/macOS differences |

---

## Deliverables

### D1: Rust Sandbox Daemon
- Unix socket / stdio / gRPC communication
- Exposed interfaces:
  - `evaluate_file_action(path, intent) -> Decision`
  - `execute(cmd, args, sandbox_policy) -> Result`
  - `read/write/list(path) -> Result`

### D2: OS-Level Isolation
- macOS: Seatbelt (`sandbox-exec`)
- Linux: Landlock + seccomp + Namespaces (`unshare` user/mount/pid)
- Windows: AppContainer (future)

### D3: Path Security
- `realpath` normalization
- Symlink target validation
- Path escape detection

### D4: TypeScript Adapter Layer
- `packages/sandbox-rs` N-API bindings
- Replace `@ku0/agent-runtime-sandbox`

---

## Technical Design

```
┌────────────────────────────────────────────────────────┐
│  TypeScript Policy Layer                               │
│  - Preflight policy decisions                          │
│  - Postflight telemetry                                │
└──────────────────────┬─────────────────────────────────┘
                       │ Unix socket / N-API
                       ▼
┌────────────────────────────────────────────────────────┐
                       │ Unix socket / N-API
                       ▼
┌────────────────────────────────────────────────────────┐
│  codex-sandbox (Rust Daemon)                           │
│  ┌─────────────┬─────────────┬─────────────┐          │
│  │ seatbelt.rs │ landlock.rs │ exec.rs     │          │
│  └─────────────┴─────────────┴─────────────┘          │
│  - Path normalization (realpath + chroot jail)         │
│  - Permission convergence (deny-by-default)            │
│  - Grant Policy Sync (from TS GrantManager)            │
│  - Audit logging                                       │
└────────────────────────────────────────────────────────┘
```

### Policy Synchronization
- **GrantManager (TS)**: Manages higher-level user approvals and confirmation UI.
- **Enforcement (Rust)**: Receives current grant snapshots from TS.
  - Rust side **MUST NOT** trigger UI confirmations directly.
  - If an action violates Rust-side policy but is "confirmable", return `NeedsConfirmation` code to TS.

---

## Implementation Plan

| Week | Deliverable | Tasks |
|------|-------------|-------|
| 1 | Feasibility assessment | Evaluate codex-rs code reuse, define interface contracts |
| 2 | Rust crate scaffold | Create `packages/sandbox-rs`, basic Unix socket service |
| 3 | Sandbox policy impl | macOS Seatbelt + Linux Landlock integration |
| 4 | TS integration | N-API bindings, replace existing Docker calls |

---

## Affected Code

| File | Change Type |
|------|-------------|
| `packages/agent-runtime/src/sandbox/index.ts` | Call Rust sidecar |
| `packages/agent-runtime-sandbox/` | Gradually deprecate |
| `packages/sandbox-rs/` | New Rust crate |

---

## Acceptance Criteria

- [ ] Sandbox startup time < 10ms
- [ ] Pass symlink escape tests
- [ ] macOS/Linux dual-platform CI passing
- [ ] Audit log records all isolated operations

---

## Risks

| Risk | Mitigation |
|------|------------|
| Rust learning curve | Reuse mature codex-rs code |
| N-API compatibility | Use stable napi-rs version |
| Platform differences | Prioritize macOS, Linux follows |

---

## Alternatives Considered

### 1. Docker (AutoGPT / Open Interpreter)
- **Pros**: Strongest isolation, industry standard.
- **Cons**: Startup time (~500ms) violates <100ms tool latency goal. Heavy resource footprint (VM overhead on macOS).
- **Decision**: Rejected for local desktop use cases; reserved for "cloud mode".

### 2. Python/Node Permission Gating (Open Interpreter Local)
- **Pros**: Zero overhead, easy to implement in TS `PermissionGate`.
- **Cons**: Vulnerable to path traversal and race conditions if `path.resolve` logic differs from OS execution.
- **Decision**: Insufficient security depth. Rust sidecar provides kernel-level enforcement.

---

## References

- Codex Seatbelt: `.tmp/analysis/codex/codex-rs/core/src/seatbelt.rs`
- Codex Landlock: `.tmp/analysis/codex/codex-rs/core/src/landlock.rs`
- Current impl: `packages/agent-runtime/src/sandbox/`
- Spec: `docs/specs/cowork/cowork-sandbox-design.md`
