# Architecture Documentation

This directory contains architectural designs, RFCs, and technical specifications for the Keep-Up platform.

---

## Agent Runtime

| Document | Description | Status |
|----------|-------------|--------|
| [agent-runtime-reference.md](./agent-runtime-reference.md) | Quick reference to authoritative spec | Active |
| [agent-runtime-module-decomposition-rfc.md](./agent-runtime-module-decomposition-rfc.md) | RFC for module decomposition (Track L) | Approved |
| [agent-runtime-stability.md](./agent-runtime-stability.md) | Stability assessment and test coverage gaps | Historical |
| [agent-system-v2.md](./agent-system-v2.md) | High-level vision for agent system | Historical |
| [agent-architecture-analysis.md](./agent-architecture-analysis.md) | Comparative analysis of Codex and Claude Code | Active |

---

## UI/LFCC Layer

| Document | Description | Status |
|----------|-------------|--------|
| [ui-contract.md](./ui-contract.md) | Frozen contract between UI and LFCC bridge | Frozen |
| [ai-native-ui-integration.md](./ai-native-ui-integration.md) | AI metadata protocol and ghost text architecture | Active |

---

## Infrastructure

| Document | Description | Status |
|----------|-------------|--------|
| [multi-server-stateless.md](./multi-server-stateless.md) | Multi-server collaboration architecture with Redis | Implemented |
| [ws-security.md](./ws-security.md) | WebSocket security (auth, rate limiting, lifecycle) | Implemented |

---

## Related Documentation

- **Specifications**: `docs/specs/` (Authoritative source for runtime contracts)
- **Roadmap**: `docs/roadmap/` (Implementation tracks)
- **Research**: `docs/research/` (Historical analysis, superseded)
