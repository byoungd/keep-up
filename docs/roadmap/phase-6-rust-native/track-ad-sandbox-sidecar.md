# Track AD: Sandbox Sidecar

> Priority: P0
> Status: Ready
> Owner: Agent Runtime Team
> Dependencies: None

---

## Overview

Replace Docker-based sandbox execution with a Rust sidecar to provide OS-level process isolation
and fast startup across macOS, Linux, and Windows.

---

## Problem Definition

| Problem | Current Implementation | Impact |
| --- | --- | --- |
| Slow startup | Docker ~500ms | Tool execution latency |
| Path escape risk | `path.resolve` comparisons | Symlink attacks |
| Cross-platform gaps | Docker dependency | macOS/Windows friction |

---

## Deliverables

### D1: Rust Sandbox Service
- Transport: N-API for local sync calls; UDS for isolation (future).
- APIs:
  - `evaluate_file_action(path, intent) -> Decision`
  - `execute(cmd, args, sandbox_policy) -> Result`
  - `read/write/list(path) -> Result`

### D2: OS-Level Isolation
- macOS: Seatbelt sandbox policies.
- Linux: Landlock + seccomp + namespaces.
- Windows: AppContainer (fallback to Docker/WSL when unavailable).

### D3: Path Security
- `realpath` normalization.
- Symlink target validation.
- Path escape detection.

### D4: TypeScript Adapter Layer
- `packages/sandbox-rs` N-API bindings.
- Replace `@ku0/agent-runtime-sandbox` in runtime integration.

---

## Platform Support Matrix

| Platform | Isolation | Fallback | Notes |
| --- | --- | --- | --- |
| macOS | Seatbelt | Docker/WSL | Uses `sandbox-exec` policies |
| Linux | Landlock + seccomp + namespaces | Docker | Requires kernel support (Landlock >= 5.13) |
| Windows | AppContainer | Docker/WSL | AppContainer policy parity required |

---

## Technical Design

```
TypeScript policy layer
  -> Rust sandbox (Seatbelt / Landlock / AppContainer)
```

### Policy Synchronization
- GrantManager remains in TypeScript (UI approvals).
- Rust only enforces the current grant snapshot.
- If an action is confirmable but blocked, Rust returns `NeedsConfirmation` to TS.

---

## Implementation Plan

| Week | Deliverable | Tasks |
| --- | --- | --- |
| 1 | Feasibility assessment | Reuse codex-rs sandbox pieces, define API contracts |
| 2 | Rust crate scaffold | `packages/sandbox-rs`, N-API bindings |
| 3 | OS policy impl | Seatbelt + Landlock + seccomp |
| 4 | TS integration | Replace Docker path, add feature flag |

---

## Affected Code

| File | Change Type |
| --- | --- |
| `packages/agent-runtime/src/sandbox/index.ts` | Call Rust sidecar |
| `packages/agent-runtime-sandbox/` | Gradual deprecation |
| `packages/sandbox-rs/` | New Rust crate |

---

## Acceptance Criteria

- [ ] Sandbox startup time under 10ms on macOS/Linux.
- [ ] Symlink escape tests pass (realpath + target validation).
- [ ] macOS/Linux CI pass with OS-native policies.
- [ ] Windows AppContainer smoke tests or fallback path verified.
- [ ] Audit logs include all isolated operations.

---

## Rollout Plan

- Feature flag: `runtime.sandbox.mode = rust|docker`.
- Cowork runtime override: `COWORK_SANDBOX_MODE=rust|docker|process|auto` (auto defaults to docker with fallback).
- Gradual rollout by OS and cohort.
- Automatic fallback to Docker on unsupported kernels.

---

## Alternatives Considered

### Docker (AutoGPT / Open Interpreter)
- Pros: Strong isolation, known behavior.
- Cons: Startup latency violates tool latency targets.

### JS-only Permission Gate
- Pros: Low effort.
- Cons: Susceptible to path traversal and TOCTOU issues.

Decision: Rust sidecar for OS-native enforcement.

---

## References

- Codex Seatbelt: `.tmp/analysis/codex/codex-rs/core/src/seatbelt.rs`
- Codex Landlock: `.tmp/analysis/codex/codex-rs/core/src/landlock.rs`
- Current impl: `packages/agent-runtime/src/sandbox/`
- Spec: `docs/specs/cowork/cowork-sandbox-design.md`
