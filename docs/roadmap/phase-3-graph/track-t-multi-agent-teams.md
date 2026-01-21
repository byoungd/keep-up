# Track T: Multi-Agent Teams and Protocols

Owner: Runtime Developer
Status: Completed
Priority: High
Timeline: Week 2-6
Dependencies: Track O A2A baseline, RuntimeMessageBus
References: `docs/analysis/architecture-deep-dive.md`, AutoGen, MetaGPT, CrewAI, AutoGPT

---

## Objective

Provide team orchestration primitives (group chat, process modes) and an external Agent Protocol
surface for task/step/artifact control.

---

## Source Analysis

- Group chat team wiring: `.tmp/analysis/autogen/python/packages/autogen-agentchat/src/autogen_agentchat/teams/_group_chat/_base_group_chat.py`.
- Role and environment routing: `.tmp/analysis/MetaGPT/metagpt/team.py`, `.tmp/analysis/MetaGPT/metagpt/environment/base_env.py`.
- Sequential and hierarchical process modes: `.tmp/analysis/crewAI/lib/crewai/src/crewai/crew.py`.
- Agent Protocol task/step schema: `.tmp/analysis/AutoGPT/classic/forge/forge/agent_protocol/models/task.py`.

---

## Tasks

### T1: Team Registry + Group Chat Routing
- Add a Team registry with participant discovery and capability tags.
- Introduce group chat routing atop RuntimeMessageBus.
- Maintain team context in CheckpointManager.

### T2: Process Modes and Manager Agent
- Implement sequential, round-robin, and hierarchical process modes.
- Add a manager agent for hierarchical delegation and arbitration.
- Persist process state and metrics in runtime telemetry.

### T3: Agent Protocol API Surface
- Add HTTP endpoints for Task/Step/Artifact lifecycle.
- Map agent protocol artifacts to Keep-Up artifact registry.
- Provide auth and audit hooks for external control.

---

## Deliverables

- `packages/agent-runtime/src/teams/` (or equivalent) module.
- Protocol server wiring (tasks/steps/artifacts) with tests.
- Documentation for team configuration and API usage.

---

## Acceptance Criteria

- Team registry supports capability discovery and group chat routing via RuntimeMessageBus.
- Process modes include sequential and hierarchical orchestration with manager agent arbitration.
- Agent Protocol API exposes Task/Step/Artifact lifecycle with audit logging.
- Team state is checkpointed and resumes without message loss.

---

## Testing

- Unit tests for team routing, process modes, and manager agent arbitration.
- Integration tests for Agent Protocol endpoints (task/step/artifact).
- Suggested command: `pnpm --filter @ku0/agent-runtime test -- --grep "team|protocol"`.
