# Architecture Documentation

This directory contains architectural designs, RFCs, and technical specifications for the Open Wrap platform.
Core application context is `apps/cowork` unless a doc explicitly targets the LFCC editor stack.

---

## Agent Runtime

See [Agent Runtime Documentation](./agent-runtime/README.md) for detailed architecture and specifications.

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

| [ws-security.md](./ws-security.md) | WebSocket security (auth, rate limiting, lifecycle) | Implemented |

---

## Related Documentation

- **Specifications**: `docs/specs/` (Authoritative source for runtime contracts)
- **Roadmap**: `docs/roadmap/` (Implementation tracks)
- **Research**: `docs/research/` (Historical analysis, superseded)
