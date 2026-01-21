# Architecture RFC: Agent Runtime Module Decomposition

Owner: Runtime Architect
Status: Approved
Date: 2026-01-19
Related: docs/roadmap/phase-1-foundation/core/track-l-architecture.md
Spec: docs/specs/agent-runtime-spec-2026.md
Standards: packages/agent-runtime/ARCHITECTURE.md

## Context
The current runtime concentrates orchestration, tooling, sandboxing, memory, and persistence in a single package. This increases coupling, reduces testability, and makes it harder to add or replace integrations without touching core runtime files. The v2026.1 spec defines explicit control, execution, and persistence planes, which we can use to establish clear module boundaries and strict dependency inversion.

## Goals
- Align module boundaries to control, execution, and persistence planes.
- Establish a core interface package that all implementations depend on.
- Provide an explicit composition root for dependency injection.
- Preserve the `@ku0/agent-runtime` public API through a facade.
- Honor mandatory integrations (OpenAI Agents SDK, mem0ai, chokidar, pino, gray-matter).

## Non-Goals
- Implementing the refactor in code.
- Changing runtime behavior or contract semantics.
- Replacing mandated third party integrations.

## Proposed Architecture

### Package Responsibilities
| Package | Responsibilities |
| --- | --- |
| `agent-runtime-core` | Interfaces, contracts, shared types, common utils |
| `agent-runtime-control` | Agent manager, policy engine, recovery engine, message bus |
| `agent-runtime-execution` | Orchestrator, turn executor, tool scheduler, SOP, routing |
| `agent-runtime-persistence` | Checkpoints, event log, artifact manager |
| `agent-runtime-sandbox` | Docker and local sandbox managers |
| `agent-runtime-memory` | Mem0 adapter, memory caches |
| `agent-runtime-tools` | Tool registry, tool servers, policy adapters |
| `agent-runtime-telemetry` | Logging, metrics, tracing adapters |
| `agent-runtime` | Facade, composition root, re-exports |

### Dependency Rules
- `agent-runtime-core` has no dependencies on other runtime packages.
- All plane packages depend only on core and external libraries.
- Cross-plane calls use core interfaces, not direct imports.
- The facade is the only package allowed to wire concrete implementations.

### Composition Root
Provide a factory-based wiring layer in the facade:
- `createRuntime(config, overrides?)` returns a fully wired runtime instance.
- `RuntimeComponents` in core declares optional overrides for tests or custom builds.
- Default factories live in the plane packages and are consumed only by the facade.

## Interface Surface (Core)
The core package defines the contracts below (non-exhaustive):
- `IAgentManager`, `IRuntimeMessageBus`
- `IPolicyEngine`, `IRecoveryEngine`
- `IOrchestrator`, `ITurnExecutor`, `IToolScheduler`, `ISOPExecutor`, `IModelRouter`
- `ICheckpointManager`, `IEventLog`, `IArtifactManager`
- `ISandboxManager`, `IMemoryManager`
- `IToolRegistry`, `IToolExecutor`
- `ILogger`, `IMetricsClient`

## Module Inventory (Draft)
This inventory maps current runtime folders to proposed packages. Placement is tentative until dependency analysis is complete.

| Current Path | Proposed Package | Notes |
| --- | --- | --- |
| `packages/agent-runtime/src/types` | `agent-runtime-core` | Shared types and contracts |
| `packages/agent-runtime/src/utils` | `agent-runtime-core` | Shared utilities |
| `packages/agent-runtime/src/assets` | `agent-runtime-core` | Shared assets/templates |
| `packages/agent-runtime/src/agents` | `agent-runtime-control` | Agent manager and lineage |
| `packages/agent-runtime/src/modes` | `agent-runtime-control` | Mode policy and plan gating |
| `packages/agent-runtime/src/security` | `agent-runtime-control` | Policy engine and permissions |
| `packages/agent-runtime/src/quota` | `agent-runtime-control` | Limits and quotas |
| `packages/agent-runtime/src/session` | `agent-runtime-control` | Session state and snapshots |
| `packages/agent-runtime/src/events` | `agent-runtime-control` | Event bus is control-plane; persistence log to be added separately |
| `packages/agent-runtime/src/orchestrator` | `agent-runtime-execution` | Orchestration state machine |
| `packages/agent-runtime/src/executor` | `agent-runtime-execution` | Turn/tool execution |
| `packages/agent-runtime/src/context` | `agent-runtime-execution` | Context manager and compaction |
| `packages/agent-runtime/src/routing` | `agent-runtime-execution` | Model routing |
| `packages/agent-runtime/src/sop` | `agent-runtime-execution` | SOP executor |
| `packages/agent-runtime/src/tasks` | `agent-runtime-execution` | Task scheduling |
| `packages/agent-runtime/src/reasoning` | `agent-runtime-execution` | Reasoning chain helpers |
| `packages/agent-runtime/src/knowledge` | `agent-runtime-execution` | Knowledge injection |
| `packages/agent-runtime/src/prompts` | `agent-runtime-execution` | Prompt templates |
| `packages/agent-runtime/src/pipeline` | `agent-runtime-execution` | Pipeline assembly |
| `packages/agent-runtime/src/preflight` | `agent-runtime-execution` | Preflight checks |
| `packages/agent-runtime/src/workflows` | `agent-runtime-execution` | Workflow templates |
| `packages/agent-runtime/src/streaming` | `agent-runtime-execution` | Streaming adapters |
| `packages/agent-runtime/src/swarm` | `agent-runtime-execution` | Multi-agent orchestration adapters |
| `packages/agent-runtime/src/checkpoint` | `agent-runtime-persistence` | Checkpoint storage |
| `packages/agent-runtime/src/artifacts` | `agent-runtime-persistence` | Artifact storage |
| `packages/agent-runtime/src/sandbox` | `agent-runtime-sandbox` | Sandbox managers |
| `packages/agent-runtime/src/memory` | `agent-runtime-memory` | Memory adapters and caches |
| `packages/agent-runtime/src/tools` | `agent-runtime-tools` | Tool registry and servers |
| `packages/agent-runtime/src/plugins` | `agent-runtime-tools` | Tool plugin registry/loader |
| `packages/agent-runtime/src/skills` | `agent-runtime-tools` | Skill registry and tool server |
| `packages/agent-runtime/src/telemetry` | `agent-runtime-telemetry` | Metrics and tracing |
| `packages/agent-runtime/src/logging` | `agent-runtime-telemetry` | Runtime logging |
| `packages/agent-runtime/src/kernel` | `agent-runtime` | Composition root |
| `packages/agent-runtime/src/index.ts` | `agent-runtime` | Public facade exports |
| `packages/agent-runtime/src/bridge` | `agent-runtime` | Thin adapter (~15KB), glue layer for @ku0/core intents |
| `packages/agent-runtime/src/browser` | `agent-runtime-tools` | Browser automation consumed by tool servers |
| `packages/agent-runtime/src/cowork` | `agent-runtime-cowork` | Large (47KB, 19 files), distinct domain with own policy engine |

## Resolved Placements
| Module | Package | Rationale |
| --- | --- | --- |
| `bridge/` | `agent-runtime` | Thin adapter (~15KB), glue layer for @ku0/core intents |
| `browser/` | `agent-runtime-tools` | Browser automation consumed by tool servers |
| `cowork/` | `agent-runtime-cowork` | Large (47KB, 19 files), distinct domain with own policy engine |
| `events/` | `agent-runtime-control` | Event bus is control-plane; persistence log to be added separately |

## Dependency Scan (Madge)
Command:
`pnpm dlx madge packages/agent-runtime/src --ts-config packages/agent-runtime/tsconfig.json --extensions ts,tsx --circular --exclude "dist"`

Result: 13 circular dependencies detected (dist excluded).

1. `types/index.ts` > `cowork/policy.ts` > `cowork/types.ts` > `modes/index.ts` > `modes/modePolicy.ts` > `security/index.ts` > `security/promptInjection.ts`
2. `types/index.ts` > `cowork/policy.ts` > `cowork/types.ts` > `modes/index.ts` > `modes/modePolicy.ts` > `security/index.ts`
3. `types/index.ts` > `cowork/policy.ts` > `cowork/types.ts` > `modes/index.ts` > `modes/modePolicy.ts`
4. `types/index.ts` > `cowork/policy.ts` > `cowork/types.ts`
5. `orchestrator/planning.ts` > `orchestrator/planPersistence.ts`
6. `types/index.ts` > `cowork/policy.ts` > `cowork/types.ts` > `workflows/index.ts` > `orchestrator/planning.ts`
7. `events/eventBus.ts` > `types/index.ts` > `cowork/policy.ts` > `telemetry/index.ts`
8. `events/a2a.ts` > `events/messageBus.ts` > `events/eventBus.ts` > `types/index.ts`
9. `sandbox/sandboxManager.ts` > `sandbox/containerFactory.ts`
10. `sandbox/sandboxManager.ts` > `sandbox/containerPool.ts`
11. `sandbox/sandboxManager.ts` > `sandbox/sandboxContext.ts`
12. `orchestrator/orchestrator.ts` > `orchestrator/requestCache.ts`
13. `orchestrator/orchestrator.ts` > `orchestrator/turnExecutor.ts`

## Cycle Resolution Plan
The following plan addresses each cycle cluster without changing behavior. These steps are intended to be applied during Phase 2/3 extraction.

| Cycle Cluster | Root Cause | Proposed Break | Target Phase |
| --- | --- | --- | --- |
| types <-> cowork <-> modes <-> security <-> telemetry | `types/index.ts` imports cowork types; cowork policy imports telemetry metrics; modes/security chain back into types | Move cowork tool context/types into `agent-runtime-cowork` and define a minimal cowork context interface in `agent-runtime-core` to avoid importing cowork from core types. Relocate cowork-specific metrics to `agent-runtime-cowork` or pass metric names from cowork into telemetry. | Phase 2 |
| events <-> types <-> cowork <-> telemetry | `types/index.ts` imports A2A adapter from `events/a2a`; event bus imports `types` | Move A2A adapter/context types into `agent-runtime-core` (or control) and have `events/a2a` depend on core. Move event payload types used by the bus to a small `events/types` module to avoid importing `types/index.ts`. | Phase 2 |
| orchestrator planning <-> planPersistence | planning creates persistence; persistence imports planning types | Move `ExecutionPlan` and `PlanStep` into `orchestrator/planTypes.ts` (or core). Update `planPersistence.ts` to import types from there. Optionally inject persistence into `PlanningEngine`. | Phase 2 |
| orchestrator <-> requestCache/turnExecutor | requestCache/turnExecutor import LLM types from orchestrator | Extract LLM request/response/tool definition types into `orchestrator/llmTypes.ts` (or core) and have orchestrator re-export them. | Phase 2 |
| sandboxManager <-> containerFactory/pool/context | `SandboxPolicy` lives in sandboxManager and is imported by helpers | Extract sandbox types (policy/session config) into `sandbox/types.ts` and have sandboxManager and helpers depend on that file. | Phase 3 |

### Follow-up Scan (After Cycle Fixes)
Command:
`pnpm dlx madge packages/agent-runtime/src --ts-config packages/agent-runtime/tsconfig.json --extensions ts,tsx --circular --exclude "dist"`

Result: no circular dependencies detected.

## Migration Plan (Phased)

### Phase 1: Inventory and RFC Approval
- Map existing modules to planes and integration packages.
- Identify cross-plane dependencies to eliminate.
- Approve final boundary rules.

### Phase 2: Core Extraction
- Move shared types and interfaces into `agent-runtime-core`.
- Define `RuntimeComponents` and factory contracts.

### Phase 3: Plane Package Extraction
- Create plane packages and move modules with `git mv`.
- Update imports to use core interfaces.

### Phase 4: Integrations and Tooling
- Split sandbox, memory, tools, and telemetry into dedicated packages.
- Enforce dependency rules via tooling (madge or dependency-cruiser).

### Phase 5: Facade and Compatibility
- Keep `@ku0/agent-runtime` exports stable.
- Add compatibility shims if required for existing imports.

## Compatibility Strategy
- The facade continues to export existing entry points.
- Runtime creation functions retain signatures while delegating to the composition root.
- Deprecated paths get temporary re-exports until consumers migrate.

## Verification
- `pnpm build` passes for all runtime packages.
- No cycles detected in the runtime dependency graph.
- Smoke test: orchestrator startup and tool registry wiring.

## Risks and Mitigations
- Dependency drift: enforce rules in CI with automated graph checks.
- Compatibility breakages: maintain facade re-exports and add shims.
- Scope creep: treat this RFC as the boundary lock before refactors.

## Open Questions (Resolved)

The following questions were raised during the RFC drafting process. Each has been resolved with a rationale.

### 1. Should `bridge/` become a dedicated package or remain in the facade?

**Resolution**: **Remain in the facade (`agent-runtime`)**.

- `bridge/` is a thin adapter (~15 KB) that maps `@ku0/core` EditIntents to runtime agent types and streams.
- It has minimal internal surface (4 files) and exists purely to glue `@ku0/core` types to orchestrator actions.
- Extracting it would add packaging overhead for little decoupling benefit.
- If bridging logic grows significantly, revisit during Phase 5 (Facade and Compatibility).

### 2. Is `browser/` best placed under tooling or a standalone integration package?

**Resolution**: **Place under `agent-runtime-tools`**.

- `BrowserManager` wraps Playwright lifecycle and exposes session/page/snapshot primitives.
- These are consumed by browser-related tool servers (e.g., screenshot, navigation, accessibility).
- Grouping with tools maintains cohesion and avoids an isolated single-purpose package.
- A standalone package would only be warranted if browser management were consumed by non-tool modules; currently it is not.

### 3. Should `cowork/` become its own package or remain in the facade?

**Resolution**: **Extract to dedicated `agent-runtime-cowork` package**.

- `cowork/` is a sizable module (~47 KB, 19 files) with its own policy engine, permission checker, session state, and orchestrator factory.
- It defines a distinct domain (collaborative editing sandboxing) that other packages do not depend on.
- Keeping it in the facade would bloat the composition root and couple optional cowork features to the minimal runtime.
- A dedicated package allows consumers who do not need cowork policies to avoid the dependency.

### 4. Should the `events/` folder be split into control-plane message bus vs persistence event log modules?

**Resolution**: **Keep in `agent-runtime-control` now; split later if needed**.

- `eventBus.ts` (typed, prioritized pub-sub) aligns with control-plane responsibilities in `agent-runtime-control`.
- `messageBus.ts` (runtime message bus for agent communication) is also control-plane infrastructure.
- A persistence-layer event log (for audit replay or checkpointing) does not yet exist in the codebase but is planned.
- When implemented, the persistence event log should live in `agent-runtime-persistence` alongside `IEventLog` interface.
- For now, move the entire `events/` folder to `agent-runtime-control`; the persistence log can be added to `agent-runtime-persistence` as a new module later.
