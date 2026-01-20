# Team Orchestration and Agent Protocol (v1)

Status: Implemented  
Owner: Agent Runtime  
Last Updated: 2026-02-15  
Applies to: Agent Runtime v1  
Related docs: `docs/roadmap/next-q2/track-t-multi-agent-teams.md`

## Context
Team orchestration enables multi-agent collaboration with explicit routing, process modes,
and a standardized Agent Protocol surface for external task/step/artifact control.

## Goals
- Register teams and discover participants by capability.
- Route group chat messages via the runtime message bus.
- Support sequential, round-robin, and hierarchical process modes.
- Provide Agent Protocol HTTP endpoints with audit logging.

## Team Registry
Teams are stored in a registry with capability discovery.

```ts
import { createTeamRegistry } from "@ku0/agent-runtime";

const registry = createTeamRegistry();
const team = await registry.registerTeam({
  name: "Alpha",
  participants: [
    { agentId: "planner", displayName: "Planner", capabilities: ["plan"] },
    { agentId: "builder", displayName: "Builder", capabilities: ["build"] },
  ],
});

const planners = registry.findParticipantsByCapability("plan");
```

## Group Chat Routing
Group chat sessions broadcast messages through the runtime message bus and checkpoint
message metadata for resume.

```ts
import { GroupChatSession } from "@ku0/agent-runtime";

const session = new GroupChatSession(messageBus, team, { checkpointManager });
await session.start();
session.broadcast("planner", "Kickoff notes");
```

## Process Modes
Process mode controllers select the next participant for each step.

```ts
import { createTeamProcessController } from "@ku0/agent-runtime";

const controller = createTeamProcessController(team, {
  mode: "hierarchical",
  manager: async () => ({ agentId: "planner", reason: "delegate" }),
});

const decision = await controller.selectParticipant({ stepId: "s1", task: "Investigate" });
```

## Agent Protocol API
The Cowork server exposes Agent Protocol endpoints under `/agent`:

- `POST /agent/tasks`
- `GET /agent/tasks`
- `GET /agent/tasks/:taskId`
- `GET /agent/tasks/:taskId/steps`
- `POST /agent/tasks/:taskId/steps`
- `GET /agent/tasks/:taskId/steps/:stepId`
- `GET /agent/tasks/:taskId/artifacts`
- `POST /agent/tasks/:taskId/artifacts`
- `GET /agent/tasks/:taskId/artifacts/:artifactId`

Requests can include `additional_input.sessionId` to target a specific session. All agent
protocol actions are audited via the Cowork audit log store.

## Checkpoint Metadata
Teams write checkpoint metadata under:
- `metadata.team` (registry snapshots)
- `metadata.teamProcess` (process mode decisions)
- `metadata.messages` (group chat history)

## Testing
Suggested command:
```bash
pnpm --filter @ku0/agent-runtime test -- --grep "team|protocol"
```
