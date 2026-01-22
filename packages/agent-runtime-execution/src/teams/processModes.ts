/**
 * Team Process Modes
 *
 * Provides sequential, round-robin, and hierarchical delegation with manager arbitration.
 */

import type { TelemetryContext } from "@ku0/agent-runtime-telemetry/telemetry";
import type { ICheckpointManager } from "../types";
import type { TeamDefinition, TeamParticipant, TeamProcessMode } from "./types";

export type TeamProcessStatus = "idle" | "running";

export interface TeamProcessStep {
  stepId: string;
  task: string;
  metadata?: Record<string, unknown>;
}

export interface TeamProcessDecision {
  stepId: string;
  agentId: string;
  mode: TeamProcessMode;
  decidedAt: number;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface TeamManagerDecision {
  agentId: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface TeamManagerInput {
  team: TeamDefinition;
  step: TeamProcessStep;
  history: TeamProcessDecision[];
}

export type TeamManager = (
  input: TeamManagerInput
) => Promise<TeamManagerDecision> | TeamManagerDecision;

export interface TeamProcessState {
  mode: TeamProcessMode;
  status: TeamProcessStatus;
  cursor: number;
  decisionCount: number;
  lastAgentId?: string;
  lastStepId?: string;
  history: TeamProcessDecision[];
}

export interface TeamProcessControllerOptions {
  mode?: TeamProcessMode;
  manager?: TeamManager;
  checkpointManager?: ICheckpointManager;
  checkpointId?: string;
  telemetry?: TelemetryContext;
  clock?: () => number;
  historyLimit?: number;
}

export class TeamProcessController {
  private readonly team: TeamDefinition;
  private mode: TeamProcessMode;
  private readonly manager?: TeamManager;
  private readonly checkpointManager?: ICheckpointManager;
  private readonly checkpointId?: string;
  private readonly telemetry?: TelemetryContext;
  private readonly clock: () => number;
  private readonly historyLimit: number;
  private cursor = 0;
  private decisionCount = 0;
  private lastAgentId?: string;
  private lastStepId?: string;
  private history: TeamProcessDecision[] = [];
  private status: TeamProcessStatus = "idle";
  private hydrated = false;

  constructor(team: TeamDefinition, options: TeamProcessControllerOptions = {}) {
    this.team = team;
    this.mode = options.mode ?? "sequential";
    this.manager = options.manager;
    this.checkpointManager = options.checkpointManager;
    this.checkpointId = options.checkpointId;
    this.telemetry = options.telemetry;
    this.clock = options.clock ?? (() => Date.now());
    this.historyLimit = options.historyLimit ?? 20;
  }

  getState(): TeamProcessState {
    return {
      mode: this.mode,
      status: this.status,
      cursor: this.cursor,
      decisionCount: this.decisionCount,
      lastAgentId: this.lastAgentId,
      lastStepId: this.lastStepId,
      history: [...this.history],
    };
  }

  setMode(mode: TeamProcessMode): void {
    if (this.mode === mode) {
      return;
    }
    this.mode = mode;
    this.telemetry?.metrics.increment("team_process_mode_switches_total", {
      team_id: this.team.teamId,
      mode,
    });
  }

  async selectParticipant(step: TeamProcessStep): Promise<TeamProcessDecision> {
    await this.ensureHydrated();
    this.status = "running";

    const decision = await this.resolveDecision(step);
    this.decisionCount += 1;
    this.lastAgentId = decision.agentId;
    this.lastStepId = step.stepId;
    this.history.push(decision);
    if (this.history.length > this.historyLimit) {
      this.history = this.history.slice(this.history.length - this.historyLimit);
    }

    await this.persistState();
    this.telemetry?.metrics.increment("team_process_decisions_total", {
      team_id: this.team.teamId,
      mode: this.mode,
    });

    return decision;
  }

  private async resolveDecision(step: TeamProcessStep): Promise<TeamProcessDecision> {
    if (this.mode === "hierarchical" && this.manager) {
      const managerDecision = await Promise.resolve(
        this.manager({
          team: this.team,
          step,
          history: [...this.history],
        })
      );
      const participant =
        this.findParticipant(managerDecision.agentId) ?? this.team.participants[0];
      return {
        stepId: step.stepId,
        agentId: participant.agentId,
        mode: this.mode,
        decidedAt: this.clock(),
        reason: managerDecision.reason,
        metadata: managerDecision.metadata,
      };
    }

    if (this.team.participants.length === 0) {
      throw new Error("Team has no participants");
    }

    if (this.mode === "round_robin") {
      const participant = this.team.participants[this.cursor % this.team.participants.length];
      this.cursor = (this.cursor + 1) % this.team.participants.length;
      return {
        stepId: step.stepId,
        agentId: participant.agentId,
        mode: this.mode,
        decidedAt: this.clock(),
      };
    }

    const participant =
      this.team.participants[Math.min(this.cursor, this.team.participants.length - 1)];
    this.cursor = Math.min(this.cursor + 1, this.team.participants.length - 1);
    return {
      stepId: step.stepId,
      agentId: participant.agentId,
      mode: this.mode,
      decidedAt: this.clock(),
    };
  }

  private async persistState(): Promise<void> {
    if (!this.checkpointManager || !this.checkpointId) {
      return;
    }
    await this.checkpointManager.updateMetadata(this.checkpointId, {
      teamProcess: {
        mode: this.mode,
        cursor: this.cursor,
        decisionCount: this.decisionCount,
        lastAgentId: this.lastAgentId,
        lastStepId: this.lastStepId,
        status: this.status,
        history: this.history,
      },
    });
    await this.checkpointManager.save(this.checkpointId);
  }

  private async ensureHydrated(): Promise<void> {
    if (this.hydrated || !this.checkpointManager || !this.checkpointId) {
      this.hydrated = true;
      return;
    }
    const checkpoint = await this.checkpointManager.load(this.checkpointId);
    const stored = readProcessState(checkpoint?.metadata?.teamProcess);
    if (stored) {
      this.mode = stored.mode;
      this.cursor = stored.cursor;
      this.decisionCount = stored.decisionCount;
      this.lastAgentId = stored.lastAgentId;
      this.lastStepId = stored.lastStepId;
      this.history = stored.history;
      this.status = stored.status;
    }
    this.hydrated = true;
  }

  private findParticipant(agentId?: string): TeamParticipant | undefined {
    if (!agentId) {
      return undefined;
    }
    for (const participant of this.team.participants) {
      if (participant.agentId === agentId) {
        return participant;
      }
    }
    return undefined;
  }
}

export function createTeamProcessController(
  team: TeamDefinition,
  options?: TeamProcessControllerOptions
): TeamProcessController {
  return new TeamProcessController(team, options);
}

function readProcessState(value: unknown): TeamProcessState | null {
  if (!isRecord(value)) {
    return null;
  }
  const mode = readMode(value.mode);
  if (!mode) {
    return null;
  }
  return {
    mode,
    status: value.status === "running" ? "running" : "idle",
    cursor: typeof value.cursor === "number" ? value.cursor : 0,
    decisionCount: typeof value.decisionCount === "number" ? value.decisionCount : 0,
    lastAgentId: typeof value.lastAgentId === "string" ? value.lastAgentId : undefined,
    lastStepId: typeof value.lastStepId === "string" ? value.lastStepId : undefined,
    history: readHistoryEntries(value.history, mode),
  };
}

function readHistoryEntries(
  history: unknown,
  fallbackMode: TeamProcessMode
): TeamProcessDecision[] {
  if (!Array.isArray(history)) {
    return [];
  }
  const entries: TeamProcessDecision[] = [];
  for (const entry of history) {
    if (!isRecord(entry)) {
      continue;
    }
    const parsed = readHistoryEntry(entry, fallbackMode);
    if (parsed) {
      entries.push(parsed);
    }
  }
  return entries;
}

function readHistoryEntry(
  entry: Record<string, unknown>,
  fallbackMode: TeamProcessMode
): TeamProcessDecision | null {
  const stepId = typeof entry.stepId === "string" ? entry.stepId : "";
  const agentId = typeof entry.agentId === "string" ? entry.agentId : "";
  if (!stepId || !agentId) {
    return null;
  }
  return {
    stepId,
    agentId,
    mode: readMode(entry.mode) ?? fallbackMode,
    decidedAt: typeof entry.decidedAt === "number" ? entry.decidedAt : Date.now(),
    reason: typeof entry.reason === "string" ? entry.reason : undefined,
    metadata: isRecord(entry.metadata) ? entry.metadata : undefined,
  };
}

function readMode(value: unknown): TeamProcessMode | null {
  switch (value) {
    case "sequential":
    case "round_robin":
    case "hierarchical":
      return value;
    default:
      return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
