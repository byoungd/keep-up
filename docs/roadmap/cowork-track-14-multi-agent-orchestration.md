# Track 14: Multi-Agent Orchestration

> [!CAUTION]
> **SUPERSEDED BY TRACK 15 (PHASE F)**
> This track has been replaced by the "Swarm Runtime" architecture in Track 15. 
> Do not implement this isolation; proceed to Track 15 for the new specification.


## Mission
Enable role-based delegation so complex tasks can be handled in parallel with
clear responsibilities and summaries.

## Primary Goal
Provide a multi-agent orchestration layer that spawns specialized subagents and
aggregates their results into a single user-facing narrative.

## Background
Claude Code and OpenCode both emphasize role separation (planner, implementer,
reviewer) to improve accuracy and reduce context overload. Multi-agent workflows
are now a standard expectation for complex tasks.

## Scope
- Orchestrator for spawning subagents with roles.
- Role-specific system prompts and tool scopes.
- Task graph for delegation and dependency tracking.
- Aggregated summaries back into the main timeline.
- UI to view subagent outputs and status.

## Non-Goals
- Distributed compute across machines.
- Autonomous long-running background agents.

## Inputs and References
- `packages/agent-runtime/src/tasks/taskGraph.ts`
- Track 9 (Plan/Build modes)
- Track 11 (Context packs)

## Execution Steps (Do This First)
1. Define role schema:
   ```ts
   type AgentRole = "planner" | "implementer" | "reviewer" | "qa";

   interface DelegatedTask {
     id: string;
     role: AgentRole;
     prompt: string;
     parentTaskId: string;
     status: "queued" | "running" | "completed" | "failed";
   }
   ```
2. Add orchestrator to create and manage delegated tasks.
3. Define handoff format for summaries and outputs.
4. Add UI timeline entries for subagent status.
5. Add approval gating when subagents request actions.

## Required Behavior
- Subagents have scoped tool access based on role and mode.
- Parent task waits for required dependencies.
- Aggregated summary is visible in the main chat timeline.
- Failures are isolated and surfaced clearly.

## Implementation Outline
1. Create `AgentOrchestrator` in agent-runtime.
2. Extend task graph to support subagent nodes.
3. Add server routes to manage delegated tasks.
4. Add UI to view and filter subagent outputs.
5. Emit telemetry for delegation outcomes.

## Deliverables
- Orchestration layer with role-based agents.
- UI for subagent status and summaries.
- Delegated task storage and audit log entries.

## Acceptance Criteria
- [ ] A task can spawn planner and reviewer subagents.
- [ ] Aggregated summary appears in the parent task timeline.
- [ ] Role-specific prompts and tool scopes are enforced.
- [ ] Delegation is visible in audit logs.

## Testing
- Unit tests for orchestration graph.
- Integration tests for delegated task lifecycle.
- `pnpm vitest run --project agent-runtime`

## Dependencies
- Track 9 for mode enforcement.
- Track 11 for context packs.

## Owner Checklist
- Follow `CODING_STANDARDS.md`.
- Update `task.md` progress markers.
- Document manual verification steps in `walkthrough.md`.
