/**
 * Team Registry
 *
 * Stores team definitions, participant capability indexes, and optional checkpoints.
 */

import type { AuditLogger, Checkpoint, ICheckpointManager } from "../types";
import type {
  TeamCheckpointInfo,
  TeamDefinition,
  TeamParticipant,
  TeamParticipantMatch,
  TeamRegistration,
} from "./types";

export interface TeamRegistryOptions {
  checkpointManager?: ICheckpointManager;
  audit?: AuditLogger;
  clock?: () => number;
}

export class TeamRegistry {
  private readonly teams = new Map<string, TeamDefinition>();
  private readonly capabilityIndex = new Map<string, Set<string>>();
  private readonly participantIndex = new Map<string, TeamParticipantMatch>();
  private readonly teamCheckpointIds = new Map<string, string>();
  private readonly checkpointManager?: ICheckpointManager;
  private readonly audit?: AuditLogger;
  private readonly clock: () => number;

  constructor(options: TeamRegistryOptions = {}) {
    this.checkpointManager = options.checkpointManager;
    this.audit = options.audit;
    this.clock = options.clock ?? (() => Date.now());
  }

  async registerTeam(input: TeamRegistration): Promise<TeamDefinition> {
    const teamId = input.teamId ?? crypto.randomUUID();
    if (this.teams.has(teamId)) {
      throw new Error(`Team ${teamId} already exists`);
    }

    this.assertUniqueParticipants(input.participants);

    const now = this.clock();
    const team: TeamDefinition = {
      teamId,
      name: input.name,
      description: input.description,
      participants: [...input.participants],
      createdAt: now,
      updatedAt: now,
      metadata: input.metadata,
    };

    this.teams.set(teamId, team);
    this.indexTeam(team);

    if (this.checkpointManager) {
      const checkpoint = await this.checkpointManager.create({
        task: `team:${team.name}`,
        agentType: "team",
        agentId: teamId,
        metadata: {
          team: buildCheckpointInfo(team, 0),
        },
      });
      this.teamCheckpointIds.set(teamId, checkpoint.id);
    }

    this.audit?.log({
      timestamp: now,
      toolName: "team.registry",
      action: "call",
      input: { teamId, name: team.name },
      sandboxed: false,
    });

    return team;
  }

  getTeam(teamId: string): TeamDefinition | null {
    return this.teams.get(teamId) ?? null;
  }

  listTeams(): TeamDefinition[] {
    return Array.from(this.teams.values());
  }

  getCheckpointId(teamId: string): string | undefined {
    return this.teamCheckpointIds.get(teamId);
  }

  async addParticipant(
    teamId: string,
    participant: TeamParticipant
  ): Promise<TeamDefinition | null> {
    const team = this.teams.get(teamId);
    if (!team) {
      return null;
    }

    if (team.participants.some((existing) => existing.agentId === participant.agentId)) {
      throw new Error(`Participant ${participant.agentId} already exists in team ${teamId}`);
    }

    team.participants.push(participant);
    team.updatedAt = this.clock();
    this.indexParticipant(team, participant);
    await this.syncCheckpoint(team);

    return team;
  }

  async removeParticipant(teamId: string, agentId: string): Promise<TeamDefinition | null> {
    const team = this.teams.get(teamId);
    if (!team) {
      return null;
    }

    const index = team.participants.findIndex((participant) => participant.agentId === agentId);
    if (index === -1) {
      return null;
    }

    const [removed] = team.participants.splice(index, 1);
    team.updatedAt = this.clock();
    this.removeParticipantIndex(team, removed);
    await this.syncCheckpoint(team);

    return team;
  }

  findParticipantsByCapability(capability: string): TeamParticipantMatch[] {
    const normalized = capability.trim();
    if (!normalized) {
      return [];
    }
    const keys = this.capabilityIndex.get(normalized);
    if (!keys) {
      return [];
    }
    const matches: TeamParticipantMatch[] = [];
    for (const key of keys) {
      const entry = this.participantIndex.get(key);
      if (entry) {
        matches.push(entry);
      }
    }
    return matches;
  }

  findTeamsByCapability(capability: string): TeamDefinition[] {
    const matches = this.findParticipantsByCapability(capability);
    const seen = new Set<string>();
    const teams: TeamDefinition[] = [];
    for (const match of matches) {
      if (!seen.has(match.teamId)) {
        const team = this.teams.get(match.teamId);
        if (team) {
          seen.add(match.teamId);
          teams.push(team);
        }
      }
    }
    return teams;
  }

  private assertUniqueParticipants(participants: TeamParticipant[]): void {
    const seen = new Set<string>();
    for (const participant of participants) {
      if (seen.has(participant.agentId)) {
        throw new Error(`Duplicate participant ${participant.agentId}`);
      }
      seen.add(participant.agentId);
    }
  }

  private indexTeam(team: TeamDefinition): void {
    for (const participant of team.participants) {
      this.indexParticipant(team, participant);
    }
  }

  private indexParticipant(team: TeamDefinition, participant: TeamParticipant): void {
    const key = createParticipantKey(team.teamId, participant.agentId);
    this.participantIndex.set(key, {
      teamId: team.teamId,
      teamName: team.name,
      participant,
    });

    for (const capability of participant.capabilities) {
      const normalized = capability.trim();
      if (!normalized) {
        continue;
      }
      const existing = this.capabilityIndex.get(normalized);
      if (existing) {
        existing.add(key);
      } else {
        this.capabilityIndex.set(normalized, new Set([key]));
      }
    }
  }

  private removeParticipantIndex(team: TeamDefinition, participant: TeamParticipant): void {
    const key = createParticipantKey(team.teamId, participant.agentId);
    this.participantIndex.delete(key);

    for (const capability of participant.capabilities) {
      const normalized = capability.trim();
      if (!normalized) {
        continue;
      }
      const existing = this.capabilityIndex.get(normalized);
      if (existing) {
        existing.delete(key);
        if (existing.size === 0) {
          this.capabilityIndex.delete(normalized);
        }
      }
    }
  }

  private async syncCheckpoint(team: TeamDefinition): Promise<void> {
    if (!this.checkpointManager) {
      return;
    }
    const checkpointId = this.teamCheckpointIds.get(team.teamId);
    if (!checkpointId) {
      return;
    }

    const { messageCount, lastMessageAt } = await readTeamCheckpointState(
      this.checkpointManager,
      checkpointId
    );

    await this.checkpointManager.updateMetadata(checkpointId, {
      team: buildCheckpointInfo(team, messageCount, lastMessageAt),
    });
  }
}

export function createTeamRegistry(options?: TeamRegistryOptions): TeamRegistry {
  return new TeamRegistry(options);
}

function createParticipantKey(teamId: string, agentId: string): string {
  return `${teamId}:${agentId}`;
}

function buildCheckpointInfo(
  team: TeamDefinition,
  messageCount: number,
  lastMessageAt?: number
): TeamCheckpointInfo {
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
    ...(typeof lastMessageAt === "number" ? { lastMessageAt } : {}),
  };
}

async function readTeamCheckpointState(
  manager: ICheckpointManager,
  checkpointId: string
): Promise<{
  messageCount: number;
  lastMessageAt?: number;
}> {
  const checkpoint = await manager.load(checkpointId);
  const team = readTeamMetadata(checkpoint);
  return {
    messageCount: team?.messageCount ?? 0,
    lastMessageAt: team?.lastMessageAt,
  };
}

function readTeamMetadata(checkpoint: Checkpoint | null): TeamCheckpointInfo | null {
  if (!checkpoint || !isRecord(checkpoint.metadata)) {
    return null;
  }
  const team = checkpoint.metadata.team;
  if (!isRecord(team)) {
    return null;
  }

  const messageCount = typeof team.messageCount === "number" ? team.messageCount : undefined;
  const lastMessageAt = typeof team.lastMessageAt === "number" ? team.lastMessageAt : undefined;
  if (messageCount === undefined) {
    return null;
  }

  return {
    teamId: typeof team.teamId === "string" ? team.teamId : "",
    name: typeof team.name === "string" ? team.name : "",
    description: typeof team.description === "string" ? team.description : undefined,
    participants: Array.isArray(team.participants)
      ? team.participants
          .filter((entry): entry is Record<string, unknown> => isRecord(entry))
          .map((entry) => ({
            agentId: typeof entry.agentId === "string" ? entry.agentId : "",
            displayName: typeof entry.displayName === "string" ? entry.displayName : "",
            role: typeof entry.role === "string" ? entry.role : undefined,
            capabilities: Array.isArray(entry.capabilities)
              ? entry.capabilities.filter((cap): cap is string => typeof cap === "string")
              : [],
          }))
      : [],
    participantCount: typeof team.participantCount === "number" ? team.participantCount : 0,
    createdAt: typeof team.createdAt === "number" ? team.createdAt : 0,
    updatedAt: typeof team.updatedAt === "number" ? team.updatedAt : 0,
    messageCount,
    ...(typeof lastMessageAt === "number" ? { lastMessageAt } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
