/**
 * Group Chat Routing
 *
 * Routes team messages across a RuntimeMessageBus and records context checkpoints.
 */

import type { TelemetryContext } from "@ku0/agent-runtime-telemetry/telemetry";
import type { AuditLogger, ICheckpointManager, MessageEnvelope, RuntimeMessageBus } from "../types";
import type {
  TeamChatPayload,
  TeamCheckpointInfo,
  TeamDefinition,
  TeamMessage,
  TeamMessageRole,
} from "./types";

export interface GroupChatSessionOptions {
  checkpointManager?: ICheckpointManager;
  checkpointId?: string;
  audit?: AuditLogger;
  telemetry?: TelemetryContext;
  clock?: () => number;
  includeSenderInBroadcast?: boolean;
  topicPrefix?: string;
}

export class GroupChatSession {
  private readonly bus: RuntimeMessageBus;
  private readonly team: TeamDefinition;
  private readonly groupTopic: string;
  private readonly includeSenderInBroadcast: boolean;
  private readonly checkpointManager?: ICheckpointManager;
  private readonly audit?: AuditLogger;
  private readonly telemetry?: TelemetryContext;
  private readonly clock: () => number;
  private readonly subscriptions: Array<{ unsubscribe: () => void }> = [];
  private readonly registrations: Array<() => void> = [];
  private checkpointId?: string;
  private checkpointInfo?: TeamCheckpointInfo;
  private started = false;

  constructor(bus: RuntimeMessageBus, team: TeamDefinition, options: GroupChatSessionOptions = {}) {
    this.bus = bus;
    this.team = team;
    this.groupTopic = `${options.topicPrefix ?? "team"}.${team.teamId}.group`;
    this.includeSenderInBroadcast = options.includeSenderInBroadcast ?? true;
    this.checkpointManager = options.checkpointManager;
    this.checkpointId = options.checkpointId;
    this.audit = options.audit;
    this.telemetry = options.telemetry;
    this.clock = options.clock ?? (() => Date.now());
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }
    this.started = true;

    if (this.checkpointManager && !this.checkpointId) {
      const checkpoint = await this.checkpointManager.create({
        task: `team:${this.team.name}:group-chat`,
        agentType: "team",
        agentId: this.team.teamId,
        metadata: {
          team: buildCheckpointInfo(this.team, 0),
        },
      });
      this.checkpointId = checkpoint.id;
    }

    this.checkpointInfo = buildCheckpointInfo(this.team, 0);

    for (const participant of this.team.participants) {
      if (!participant.handler) {
        continue;
      }
      const unregister = this.bus.registerAgent(participant.agentId, participant.handler);
      this.registrations.push(unregister);
    }

    const subscription = this.bus.subscribe(this.groupTopic, (envelope) => {
      void this.handleGroupEnvelope(envelope);
    });
    this.subscriptions.push(subscription);
  }

  stop(): void {
    for (const subscription of this.subscriptions) {
      subscription.unsubscribe();
    }
    this.subscriptions.length = 0;

    for (const unregister of this.registrations) {
      unregister();
    }
    this.registrations.length = 0;

    this.started = false;
  }

  broadcast(
    from: string,
    content: string,
    options: { role?: TeamMessageRole; metadata?: Record<string, unknown> } = {}
  ): TeamMessage {
    const message = createTeamMessage(this.team.teamId, from, content, options, this.clock());
    const payload: TeamChatPayload = {
      teamId: this.team.teamId,
      scope: "group",
      message,
    };
    this.bus.publish(from, this.groupTopic, payload);
    this.audit?.log({
      timestamp: this.clock(),
      toolName: "team.groupChat",
      action: "call",
      input: { teamId: this.team.teamId, from, scope: "group" },
      sandboxed: false,
    });
    return message;
  }

  sendToParticipant(
    from: string,
    to: string,
    content: string,
    options: { role?: TeamMessageRole; metadata?: Record<string, unknown> } = {}
  ): TeamMessage {
    const message = createTeamMessage(this.team.teamId, from, content, options, this.clock());
    const payload: TeamChatPayload = {
      teamId: this.team.teamId,
      scope: "direct",
      message,
      to,
    };
    this.bus.send(from, to, payload);
    void this.recordMessage(message);
    return message;
  }

  getCheckpointId(): string | undefined {
    return this.checkpointId;
  }

  getGroupTopic(): string {
    return this.groupTopic;
  }

  private async handleGroupEnvelope(envelope: MessageEnvelope): Promise<void> {
    const payload = readTeamChatPayload(envelope);
    if (!payload || payload.teamId !== this.team.teamId || payload.scope !== "group") {
      return;
    }

    await this.recordMessage(payload.message);

    for (const participant of this.team.participants) {
      if (!this.includeSenderInBroadcast && participant.agentId === payload.message.from) {
        continue;
      }
      const directPayload: TeamChatPayload = {
        teamId: this.team.teamId,
        scope: "direct",
        message: payload.message,
        to: participant.agentId,
      };
      this.bus.send(payload.message.from, participant.agentId, directPayload);
    }
  }

  private async recordMessage(message: TeamMessage): Promise<void> {
    if (!this.checkpointManager || !this.checkpointId || !this.checkpointInfo) {
      return;
    }

    await this.checkpointManager.addMessage(this.checkpointId, {
      role: message.role,
      content: `${message.from}: ${message.content}`,
    });

    this.checkpointInfo.messageCount += 1;
    this.checkpointInfo.lastMessageAt = message.createdAt;

    await this.checkpointManager.updateMetadata(this.checkpointId, {
      team: {
        ...this.checkpointInfo,
      },
    });

    this.telemetry?.metrics.increment("team_messages_total", {
      team_id: this.team.teamId,
    });
  }
}

function createTeamMessage(
  teamId: string,
  from: string,
  content: string,
  options: { role?: TeamMessageRole; metadata?: Record<string, unknown> },
  createdAt: number
): TeamMessage {
  return {
    messageId: crypto.randomUUID(),
    teamId,
    from,
    role: options.role ?? "assistant",
    content,
    createdAt,
    metadata: options.metadata,
  };
}

function readTeamChatPayload(envelope: MessageEnvelope): TeamChatPayload | null {
  if (!envelope.payload || typeof envelope.payload !== "object") {
    return null;
  }
  const payload = envelope.payload as TeamChatPayload;
  if (!payload.teamId || !payload.message) {
    return null;
  }
  return payload;
}

function buildCheckpointInfo(team: TeamDefinition, messageCount: number): TeamCheckpointInfo {
  return {
    teamId: team.teamId,
    name: team.name,
    description: team.description,
    participants: team.participants.map((participant) => ({
      agentId: participant.agentId,
      displayName: participant.displayName,
      role: participant.role,
      capabilities: [...participant.capabilities],
    })),
    participantCount: team.participants.length,
    createdAt: team.createdAt,
    updatedAt: team.updatedAt,
    messageCount,
  };
}
