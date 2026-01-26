# Phase 10: Coding Agent Parity (Claude Code / Codex / OpenCode)

> Date: 2026-01-25
> Status: Proposed
> Owner: Agent Runtime + Developer Experience
> Dependencies: Phase 9 Convergence, Agent Runtime Spec v2026.1, UI Cowork tracks
> Sources: docs/analysis/agent-runtime-deep-research-2026-01-24.md, docs/specs/agent-runtime-spec-2026.md

---

## Overview

Phase 10 brings Open Wrap to feature parity with the leading local coding agents
(Claude Code, Codex CLI, OpenCode). The focus is on CLI/TUI experience, tool
coverage, plugin ecosystem, MCP/LSP integrations, safety approvals, context
compression, and recovery flows.

Work is fully parallelized into 10 tracks with minimal overlap. Each track is
self-contained and references the runtime spec as the source of truth.

---

## Track Index (Parallelizable)

| Track | Focus | Priority | Dependencies | Document |
| --- | --- | --- | --- | --- |
| BA | CLI parity + non-interactive agent mode | P0 | Agent runtime core | track-ba-cli-parity.md |
| BB | TUI parity + session UX | P0 | Track BA | track-bb-tui-parity.md |
| BC | Core toolchain parity (file/bash/patch/browser/web) | P0 | Track BA | track-bc-toolchain-parity.md |
| BD | Plugin ecosystem + commands + hooks + skills | P1 | Tracks BA, BC | track-bd-plugins-hooks-skills.md |
| BE | MCP integration + governance | P1 | Tracks BC, BD | track-be-mcp-integration.md |
| BF | LSP code intelligence parity | P1 | Track BC | track-bf-lsp-intelligence.md |
| BG | Sandbox/approval UX + audit parity | P1 | Tracks BA, BC | track-bg-approvals-sandbox.md |
| BH | Context compaction + memory continuity | P2 | Tracks BA, BC | track-bh-context-compaction.md |
| BI | Persistence, recovery, time-travel | P2 | Tracks BA, BG | track-bi-recovery-time-travel.md |
| BJ | IDE + GitHub integration surfaces | P2 | Tracks BA, BD | track-bj-ide-github.md |

---

## Parallelization Strategy

- BA/BC can start immediately; they define the CLI and tool surface.
- BB depends on BA for CLI runtime wiring but can be developed using mock data.
- BD/BE/BF can proceed once BC registers the baseline tool registry.
- BG/BH/BI are independent hardening tracks that integrate via runtime options.
- BJ can proceed once BD establishes plugin/command routing.

---

## Shared Interfaces (Phase 10 Week 1)

Freeze these interfaces before parallel work begins:

- CLI config schema (provider/model/output/session/sandbox settings)
- Session record schema (messages, tool calls, approvals)
- Tool registry naming + policy annotation conventions
- Plugin manifest + command/hook/skill routing contract
- Approval request/response envelope for CLI/TUI

---

## Definition of Done (All Tracks)

- Each track meets acceptance criteria in its document.
- Targeted unit/integration tests executed per track validation section.
- No regressions in runtime orchestration, policy enforcement, or audit logs.
- Roadmap progress updated with evidence (tests, screenshots, or PRs).

---

## References

- Agent Runtime Spec: docs/specs/agent-runtime-spec-2026.md
- Research Summary: docs/analysis/agent-runtime-deep-research-2026-01-24.md
- Phase 9: docs/roadmap/phase-9-convergence/README.md
- UI Cowork: docs/roadmap/ui-cowork/README.md
