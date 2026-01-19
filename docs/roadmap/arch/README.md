# Architecture Track Index (Module Decomposition)

This folder contains parallelizable tracks for the Track L module decomposition. Each track is
scoped to a single plane or wiring task so separate agents can implement in parallel and deliver
independent PRs. All tracks must comply with:

- docs/roadmap/agent-runtime-2026-track-l-architecture.md
- docs/architecture/agent-runtime-module-decomposition-rfc.md
- packages/agent-runtime/ARCHITECTURE.md

## Tracks
- Track L1: Execution Plane Package Extraction
- Track L2: Persistence Plane Package Extraction
- Track L3: Tools Plane Package Extraction
- Track L4: Facade Wiring and Dependency Enforcement

## Foundation Upgrade Tracks (Parallel)
- Track M1: Runtime Message Bus Integration
- Track M2: Turn Checkpoint Integration
- Track M3: Tool Output Spooling and Truncation
- Track M4: Subagent Tool Registry Isolation
- Track M5: Model Routing Fallback and Health

## Dependency Notes
- Tracks L1/L2/L3 can be developed in parallel.
- Track L4 depends on L1/L2/L3 being merged (facade and re-exports).
- Tracks M1-M5 can be developed in parallel; each must follow new module boundaries and core
  interface contracts.
