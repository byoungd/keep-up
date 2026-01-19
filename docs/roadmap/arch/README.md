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

## Dependency Notes
- Tracks L1/L2/L3 can be developed in parallel.
- Track L4 depends on L1/L2/L3 being merged (facade and re-exports).
