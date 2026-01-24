# Track AV: Cognition Delivery (Phase 4 Completion)

> Priority: P0
> Status: Proposed
> Owner: Agent Runtime Team
> Dependencies: Phase 3 Graph Runtime, Track AW (vector similarity, LSP indexer)
> Source: docs/roadmap/phase-4-cognition/README.md

---

## Objective

Complete the cognition layer by delivering Phase 4 tracks X/Y/Z in production form.
This track closes the gap from "tool-using agent" to "adaptive learner".

---

## Scope

- Track X: Deep Code Perception
  - LSP-native symbol graph and dependency awareness.
  - CodeKnowledgeGraph with stable queries and caching.
- Track Y: Adaptive Learning
  - Preference extraction pipeline and persistent semantic memory store.
  - Long-term policy and style retention across sessions.
- Track Z: Agent Gym
  - KeepUpGym benchmarks, datasets, and CI gating.

---

## Out of Scope

- UI redesign in apps/cowork.
- New third-party model integrations.
- Replacing LFCC or Loro subsystems.

---

## Work Items (Parallelizable)

1) Deep Code Perception (Track X)
- Implement semantic symbol map and LSP-native tools.
- Build CodeKnowledgeGraph with stable indexing.
- Wire symbol context provider into orchestrator context frames.

2) Adaptive Learning (Track Y)
- Preference extraction and rule persistence.
- SemanticMemoryStore backed by local-first storage and vector similarity.
- Policy merge rules for hard constraints vs soft preferences.

3) Agent Gym (Track Z)
- Benchmark harness and scenario datasets.
- CI gates and KPI baselines recorded.
- Add regression tests for perception and memory.

---

## Implementation Spec (Executable)

1) LSP-native perception
- Add a CodeKnowledgeGraph interface in agent-runtime-core.
- Implement symbol indexer in AW (Rust) and expose through TS.
- Add LSP-native tools (nav_def, nav_refs, nav_symbols) with stable ordering.

2) Adaptive learning storage
- Define SemanticMemoryRecord schema (rule, source, confidence, timestamps).
- Persist in local-first storage (Track AU output or existing storage-engine).
- Add retrieval with deterministic ranking and policy precedence.

3) Gym harness
- Implement KeepUpGym scenarios for perception accuracy, recall, and plan quality.
- Add CI command `pnpm test:q3` and store baselines in docs/roadmap/phase-4-cognition.

---

## Deliverables

- CodeKnowledgeGraph API and LSP-native tools.
- SemanticMemoryStore with persistence and retrieval policy.
- KeepUpGym benchmark suite wired into CI.

---

## Acceptance Criteria

- LSP-native queries return results in under target latency (per Phase 4 AC).
- User preferences persist across sessions without regression.
- Gym metrics and baselines are recorded and enforced in CI.

---

## Validation

- Run the Phase 4 acceptance criteria suite.
- Use existing test wiring from docs/roadmap/phase-4-cognition/acceptance-criteria.md.


## Single-Doc Execution Checklist

1) Create feature branch
- git fetch origin
- git checkout main
- git pull --ff-only
- git checkout -b feat/track-<id>-<short-name>

2) Initialize required artifacts
- task.md: add checklist items from this track
- implementation_plan.md: summarize steps and dependencies
- walkthrough.md: add validation steps and test commands

3) Implement the scope
- Follow the Implementation Spec in this document only
- Keep changes minimal and within scope

4) Validate
- Run the commands listed under Validation in this document
- Run: pnpm biome check --write

5) Commit and PR
- git add -A
- git commit -m "feat: <track-id> <summary>"
- git push -u origin feat/track-<id>-<short-name>
- Open PR with the template below

### PR Template
- What changed and why
- Tests: <command(s)> or "Not run (docs-only)"
- Risks/known issues
- Spec sections satisfied (list exact headings)
