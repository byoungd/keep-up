# Cowork Desktop Integration Spec (Phase 2)

> [!NOTE]
> This specification describes the future integration with a Desktop App wrapper (e.g. Tauri/Electron).
> It relies on the core contracts defined in Phase 1 & 2.

**Related Specs:**
- [Agent Runtime Spec](file:///Users/han/Documents/Code/Parallel/keep-up/docs/specs/agent-runtime-spec-2026.md) — Core Sandbox Interfaces
- [Cowork App Architecture](file:///Users/han/Documents/Code/Parallel/keep-up/docs/specs/cowork/cowork-app-architecture.md) — The App Structure

---

## Platform Gate
- Cowork mode is enabled only on macOS in the research preview.
- Other platforms require explicit feature flag and policy approval.

## Sandbox Adapter
### ExecutionSandboxAdapter
- Abstract interface for executing commands in an isolated VM or container.
- Responsibilities:
  - Execute tool commands in a sandboxed environment.
  - Expose a read/write proxy for granted folders.
  - Record audit logs and resource usage.

### Observed Cowork Sandbox Details
- Cowork appears to run inside a Linux VM launched via Apple VZVirtualMachine.
- The VM mounts granted folders under `/sessions/<id>/mnt`, with `outputs` and `uploads` directories.
- Network access is proxied through local sockets (HTTP/SOCKS), enabling enforceable allowlists.

### File Grant Handshake
- Desktop app must present a folder picker and pass granted roots to runtime.
- Runtime enforces grants for all file tool operations.
- Grants are session-scoped and expire on session end.

## Connector Integration
- Desktop app enumerates available connectors and their scopes.
- Cowork session must explicitly enable connectors used in a task.
- Connector enablement is logged with scope details.

## Desktop Extensions (MCP)
- Extensions are installed locally and registered in a trust registry.
- Cowork mode only loads extensions from trusted sources.
- Each extension declares required permissions; user must approve.

## Claude in Chrome
- Chrome extension can be enabled per session.
- Network access is allowlist-based; default deny outside trusted domains.
- All browser actions are logged and surfaced in task summary.

## Task Controls from Desktop UI
- Pause/Resume/Cancel task actions should call Cowork runtime APIs.
- The runtime must emit status updates compatible with UI polling or streaming.

## Open Questions
- Should sandbox execution be bundled with the desktop app or provided as a service?
- What is the minimum viable permission UI for folder grants and connectors?
