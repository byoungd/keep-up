/**
 * Team Registry + Group Chat Tests
 */

import { createMessageBus } from "@ku0/agent-runtime-control";
import {
  createCheckpointManager,
  InMemoryCheckpointStorage,
} from "@ku0/agent-runtime-persistence/checkpoint";
import { describe, expect, it } from "vitest";
import type { TeamChatPayload, TeamDefinition } from "../teams";
import { createTeamProcessController, createTeamRegistry, GroupChatSession } from "../teams";

describe("TeamRegistry", () => {
  it("indexes participants by capability", async () => {
    const registry = createTeamRegistry();
    const team = await registry.registerTeam({
      name: "Alpha",
      participants: [
        {
          agentId: "agent-a",
          displayName: "Planner",
          capabilities: ["plan", "review"],
        },
        {
          agentId: "agent-b",
          displayName: "Builder",
          capabilities: ["build"],
        },
      ],
    });

    const matches = registry.findParticipantsByCapability("plan");
    expect(matches).toHaveLength(1);
    expect(matches[0].teamId).toBe(team.teamId);
    expect(matches[0].participant.agentId).toBe("agent-a");
  });

  it("persists checkpoint metadata when enabled", async () => {
    const storage = new InMemoryCheckpointStorage();
    const checkpointManager = createCheckpointManager({ storage });
    const registry = createTeamRegistry({ checkpointManager });

    const team = await registry.registerTeam({
      name: "Delta",
      participants: [
        {
          agentId: "agent-x",
          displayName: "Analyst",
          capabilities: ["analysis"],
        },
      ],
    });

    const checkpointId = registry.getCheckpointId(team.teamId);
    expect(checkpointId).toBeDefined();
    if (!checkpointId) {
      return;
    }

    const checkpoint = await storage.load(checkpointId);
    expect(checkpoint?.metadata).toBeDefined();
    const metadata = checkpoint?.metadata as Record<string, unknown>;
    const teamMeta = metadata?.team as Record<string, unknown> | undefined;
    expect(teamMeta?.name).toBe("Delta");
    expect(teamMeta?.participantCount).toBe(1);
  });
});

describe("GroupChatSession", () => {
  it("routes group messages to all participants and records checkpoints", async () => {
    const bus = createMessageBus();
    const storage = new InMemoryCheckpointStorage();
    const checkpointManager = createCheckpointManager({ storage });

    const receivedA: TeamChatPayload[] = [];
    const receivedB: TeamChatPayload[] = [];

    const team: TeamDefinition = {
      teamId: "team-1",
      name: "Bravo",
      description: "Test team",
      participants: [
        {
          agentId: "agent-a",
          displayName: "Agent A",
          capabilities: ["chat"],
          handler: (envelope) => {
            receivedA.push(envelope.payload as TeamChatPayload);
          },
        },
        {
          agentId: "agent-b",
          displayName: "Agent B",
          capabilities: ["chat"],
          handler: (envelope) => {
            receivedB.push(envelope.payload as TeamChatPayload);
          },
        },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const session = new GroupChatSession(bus, team, { checkpointManager });
    await session.start();

    session.broadcast("agent-a", "Hello team");

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(receivedA).toHaveLength(1);
    expect(receivedB).toHaveLength(1);
    expect(receivedA[0].scope).toBe("direct");
    expect(receivedB[0].message.content).toBe("Hello team");

    const checkpointId = session.getCheckpointId();
    if (!checkpointId) {
      return;
    }

    await checkpointManager.save(checkpointId);
    const checkpoint = await storage.load(checkpointId);
    expect(checkpoint?.messages).toHaveLength(1);
    const metadata = checkpoint?.metadata as Record<string, unknown>;
    const teamMeta = metadata?.team as Record<string, unknown> | undefined;
    expect(teamMeta?.messageCount).toBe(1);
  });
});

describe("TeamProcessController", () => {
  const team: TeamDefinition = {
    teamId: "team-process",
    name: "Process Team",
    participants: [
      { agentId: "agent-a", displayName: "Agent A", capabilities: ["plan"] },
      { agentId: "agent-b", displayName: "Agent B", capabilities: ["build"] },
      { agentId: "agent-c", displayName: "Agent C", capabilities: ["review"] },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  it("runs sequential mode without wrapping", async () => {
    const controller = createTeamProcessController(team, { mode: "sequential" });
    const step1 = await controller.selectParticipant({ stepId: "s1", task: "Task 1" });
    const step2 = await controller.selectParticipant({ stepId: "s2", task: "Task 2" });
    const step3 = await controller.selectParticipant({ stepId: "s3", task: "Task 3" });
    const step4 = await controller.selectParticipant({ stepId: "s4", task: "Task 4" });

    expect(step1.agentId).toBe("agent-a");
    expect(step2.agentId).toBe("agent-b");
    expect(step3.agentId).toBe("agent-c");
    expect(step4.agentId).toBe("agent-c");
  });

  it("round-robins across participants", async () => {
    const controller = createTeamProcessController(team, { mode: "round_robin" });
    const step1 = await controller.selectParticipant({ stepId: "s1", task: "Task 1" });
    const step2 = await controller.selectParticipant({ stepId: "s2", task: "Task 2" });
    const step3 = await controller.selectParticipant({ stepId: "s3", task: "Task 3" });
    const step4 = await controller.selectParticipant({ stepId: "s4", task: "Task 4" });

    expect(step1.agentId).toBe("agent-a");
    expect(step2.agentId).toBe("agent-b");
    expect(step3.agentId).toBe("agent-c");
    expect(step4.agentId).toBe("agent-a");
  });

  it("uses manager arbitration for hierarchical mode", async () => {
    const controller = createTeamProcessController(team, {
      mode: "hierarchical",
      manager: () => ({ agentId: "agent-b", reason: "delegate" }),
    });

    const decision = await controller.selectParticipant({ stepId: "s1", task: "Task 1" });
    expect(decision.agentId).toBe("agent-b");
    expect(decision.reason).toBe("delegate");
  });

  it("persists process state in checkpoint metadata", async () => {
    const storage = new InMemoryCheckpointStorage();
    const checkpointManager = createCheckpointManager({ storage });
    const checkpoint = await checkpointManager.create({
      task: "Team Process",
      agentType: "team",
      agentId: team.teamId,
    });

    const controller = createTeamProcessController(team, {
      mode: "round_robin",
      checkpointManager,
      checkpointId: checkpoint.id,
    });

    await controller.selectParticipant({ stepId: "s1", task: "Task 1" });

    const loaded = await storage.load(checkpoint.id);
    const metadata = loaded?.metadata as Record<string, unknown> | undefined;
    const process = metadata?.teamProcess as Record<string, unknown> | undefined;
    expect(process?.decisionCount).toBe(1);
    expect(process?.lastAgentId).toBe("agent-a");
  });
});
