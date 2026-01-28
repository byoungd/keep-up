# Phase 11: Gateway Architecture & Multi-Surface Integration

> Date: 2026-01-28
> Status: Proposed
> Owner: Agent Runtime + Platform Engineering
> Dependencies: Phase 10 Coding Agent Parity, UI Cowork tracks
> Sources: docs/analysis/moltbot.md, docs/analysis/agent-runtime-deep-research-2026-01-24.md

---

## Overview

Phase 11 introduces a unified **Gateway Architecture** for multi-surface integration,
drawing from Moltbot's mature patterns. The focus is on WebSocket control plane design,
multi-channel routing, layered skills system, device node capabilities, session isolation,
and a pluggable policy engine.

Work is fully parallelized into 6 tracks. Tracks CA, CC, and CD can start immediately
with no dependencies. Tracks CB, CE, and CF follow in sequence.

---

## Track Index (Parallelizable)

| Track | Focus | Priority | Dependencies | Document |
| --- | --- | --- | --- | --- |
| CA | Gateway WebSocket Control Plane | P0 | None | track-ca-gateway-control-plane.md |
| CB | Multi-Channel Unified Routing | P0 | Track CA | track-cb-multi-channel-routing.md |
| CC | Skills System Layering | P1 | None | track-cc-skills-layering.md |
| CD | Desktop/Mobile Device Nodes | P1 | None | track-cd-desktop-device-nodes.md |
| CE | Session Isolation & Sandboxing | P1 | Track CA | track-ce-session-isolation.md |
| CF | Pluggable Policy Engine | P2 | Track CE | track-cf-policy-engine.md |

---

## Parallelization Strategy

```
Week 1: CA + CC + CD (no dependencies, immediate start)
        ├── CA: Gateway control plane design & implementation
        ├── CC: Skills layering (bundled/managed/workspace)
        └── CD: Device node protocol & Tauri integration

Week 2: CB + CE (depend on CA session model)
        ├── CB: Channel routing contracts & plugin interface
        └── CE: Main/Non-main session isolation

Week 3: CF (depends on CE security model)
        └── CF: Policy engine with allow/deny/ask_user rules
```

---

## Shared Interfaces (Week 1 Freeze)

Freeze these interfaces before parallel work begins:

- **Gateway WebSocket protocol**: Message envelope, method routing, event broadcast
- **Session key schema**: Session ID, agent ID, channel ID, isolation level
- **Channel interface contract**: `gatewayMethods`, `allowFrom`, `dmPolicy`, `groups`
- **Skill manifest schema**: `SKILL.md` format, tool definitions, dependency declarations
- **Node capability protocol**: Device commands (`camera.snap`, `screen.record`, `location.get`)
- **Policy rule format**: Allow/deny/ask_user with tool name/argument matching

---

## Definition of Done (All Tracks)

- Each track meets acceptance criteria in its document
- Unit/integration tests executed per track validation section
- No regressions in runtime orchestration, policy enforcement, or audit logs
- Roadmap progress updated with evidence (tests, screenshots, or PRs)

---

## Key Learnings from Moltbot Analysis

| Pattern | Moltbot Implementation | A-keep-up Adaptation |
| --- | --- | --- |
| **Gateway Control Plane** | Single WS on :18789 for all clients | Unified cowork WS control |
| **Channel Plugins** | `extensions/` + isolated `package.json` | Similar plugin isolation |
| **Skills Layering** | bundled/managed/workspace directories | Support remote + workspace |
| **Device Nodes** | Swift/Kotlin apps as capability nodes | Tauri + potential mobile |
| **Session Isolation** | Main (full access) / Non-main (sandbox) | Per-session Docker sandbox |
| **Policy Engine** | Approval → Sandbox → Escalate flow | Pluggable safety checkers |

---

## References

- Moltbot Analysis: docs/analysis/moltbot.md
- Agent Runtime Research: docs/analysis/agent-runtime-deep-research-2026-01-24.md
- Phase 10: docs/roadmap/phase-10-coding-agent-parity/README.md
- UI Cowork: docs/roadmap/ui-cowork/README.md
