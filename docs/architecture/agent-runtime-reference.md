# Agent Runtime Architecture Reference

> **AUTHORITATIVE SPECIFICATION**: `docs/specs/agent-runtime-spec-2026.md`

This document serves as a bridge for the architecture documentation. The core technical specification for the Agent Runtime—including the Orchestrator, Checkpointing, Recovery, and Role definitions—is now fully defined in the **Agent Runtime Specification v2026.1**.

## Key References

| Concept | Definition Location |
|---------|---------------------|
| **Architecture Layers** | [Spec Section 4](file:///docs/specs/agent-runtime-spec-2026.md#4-architecture) |
| **Recovery Contract** | [Spec Section 5.2](file:///docs/specs/agent-runtime-spec-2026.md#52-recovery-contract) |
| **Persistence Schema** | [Spec Section 8](file:///docs/specs/agent-runtime-spec-2026.md#8-storage) |
| **Role SOPs** | [Spec Section 7](file:///docs/specs/agent-runtime-spec-2026.md#7-role-definitions-sops) |

## Relation to Other Docs

- **`docs/architecture/agent-system-v2.md`**: Provides high-level product vision (Thinking, Memory, Multi-modal). The implementation details of the *Runtime* loop in this document are superseded by the `agent-runtime-spec-2026.md`.
- **`docs/architecture/AGENT_RUNTIME_STABILITY.md`**: Historical status report (Jan 2026). Reflects the state *before* the adoption of the unified consensus architecture.
- **`docs/research/*`**: All analysis documents in this folder are historical/superseded.

## Migration Guide

Developers working on the `packages/agent-runtime` should primarily reference `docs/specs/agent-runtime-spec-2026.md`. Changes to the runtime loop, tool execution, or state persistence MUST comply with the contracts defined therein.
