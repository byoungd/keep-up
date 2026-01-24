import type { CoworkWorkspaceEvent, CoworkWorkspaceSession } from "@ku0/agent-runtime";
import {
  type WorkspaceEvent,
  type WorkspaceSession,
  WorkspaceSessionManager,
} from "@ku0/agent-runtime-control";
import type {
  CoworkWorkspaceEventInput,
  WorkspaceEventStoreLike,
  WorkspaceSessionStoreLike,
} from "../../storage/contracts";
import { COWORK_EVENTS, type SessionEventHub } from "../../streaming/eventHub";

type Logger = {
  info?: (message: string, meta?: Record<string, unknown>) => void;
  warn?: (message: string, meta?: Record<string, unknown>) => void;
  error?: (message: string, meta?: Record<string, unknown>) => void;
};

type WorkspaceSessionRuntimeDeps = {
  workspaceSessions: WorkspaceSessionStoreLike;
  workspaceEvents: WorkspaceEventStoreLike;
  events: SessionEventHub;
  logger?: Logger;
};

type WorkspaceSessionCreateInput = {
  workspaceSessionId: string;
  kind: CoworkWorkspaceSession["kind"];
  ownerAgentId?: string;
};

const STATUS_VALUES: CoworkWorkspaceSession["status"][] = ["created", "active", "paused", "closed"];

export class WorkspaceSessionRuntime {
  private readonly manager: WorkspaceSessionManager;
  private readonly workspaceSessions: WorkspaceSessionStoreLike;
  private readonly workspaceEvents: WorkspaceEventStoreLike;
  private readonly events: SessionEventHub;
  private readonly logger?: Logger;
  private lastSequence = 0;
  private drainPromise: Promise<void> | null = null;

  constructor(deps: WorkspaceSessionRuntimeDeps) {
    this.manager = new WorkspaceSessionManager();
    this.workspaceSessions = deps.workspaceSessions;
    this.workspaceEvents = deps.workspaceEvents;
    this.events = deps.events;
    this.logger = deps.logger;
  }

  createSession(input: WorkspaceSessionCreateInput): WorkspaceSession {
    return this.manager.createSession({
      sessionId: input.workspaceSessionId,
      kind: input.kind,
      ownerAgentId: input.ownerAgentId,
    });
  }

  pauseSession(workspaceSessionId: string): void {
    this.manager.pauseSession(workspaceSessionId);
  }

  resumeSession(workspaceSessionId: string): void {
    this.manager.resumeSession(workspaceSessionId);
  }

  closeSession(workspaceSessionId: string): void {
    this.manager.closeSession(workspaceSessionId);
  }

  sendInput(workspaceSessionId: string, payload: Record<string, unknown>): void {
    this.manager.sendInput(workspaceSessionId, payload);
  }

  async drainAndPublish(): Promise<void> {
    if (this.drainPromise) {
      return this.drainPromise;
    }
    this.drainPromise = this.flushEvents()
      .catch((error) => {
        this.logger?.error?.("Failed to drain workspace session events", {
          error: error instanceof Error ? error.message : String(error),
        });
      })
      .finally(() => {
        this.drainPromise = null;
      });
    return this.drainPromise;
  }

  private async flushEvents(): Promise<void> {
    const drained = this.manager.drainEvents(this.lastSequence);
    if (drained.length === 0) {
      return;
    }
    this.lastSequence = drained[drained.length - 1]?.sequence ?? this.lastSequence;

    const grouped = new Map<string, WorkspaceEvent[]>();
    for (const event of drained) {
      const list = grouped.get(event.sessionId) ?? [];
      list.push(event);
      grouped.set(event.sessionId, list);
    }

    for (const [workspaceSessionId, events] of grouped) {
      const session = await this.workspaceSessions.getById(workspaceSessionId);
      if (!session) {
        this.logger?.warn?.("Workspace session missing for runtime event", {
          workspaceSessionId,
        });
        continue;
      }

      const stored = await this.workspaceEvents.appendMany(
        events.map((event) => toWorkspaceEventInput(event, session))
      );

      for (const event of stored) {
        this.events.publish(session.sessionId, COWORK_EVENTS.WORKSPACE_SESSION_EVENT, {
          sessionId: session.sessionId,
          workspaceSessionId: session.workspaceSessionId,
          event,
        });
      }

      await this.updateSessionFromEvents(session, events, stored);
    }
  }

  private async updateSessionFromEvents(
    session: CoworkWorkspaceSession,
    runtimeEvents: WorkspaceEvent[],
    storedEvents: CoworkWorkspaceEvent[]
  ): Promise<void> {
    const statusUpdate = resolveStatusUpdate(runtimeEvents);
    const latestTimestamp = storedEvents.reduce(
      (latest, event) => Math.max(latest, event.timestamp),
      session.updatedAt
    );

    let statusChanged = false;
    let endedChanged = false;

    const updated = await this.workspaceSessions.update(session.workspaceSessionId, (prev) => {
      const nextStatus = statusUpdate?.status ?? prev.status;
      const nextUpdatedAt = Math.max(prev.updatedAt, latestTimestamp);
      const nextEndedAt =
        nextStatus === "closed" && !prev.endedAt
          ? (statusUpdate?.timestamp ?? nextUpdatedAt)
          : prev.endedAt;

      statusChanged = nextStatus !== prev.status;
      endedChanged = nextEndedAt !== prev.endedAt && nextEndedAt !== undefined;

      return {
        ...prev,
        status: nextStatus,
        updatedAt: nextUpdatedAt,
        endedAt: nextEndedAt,
      };
    });

    if (!updated) {
      return;
    }

    if (statusChanged) {
      this.events.publish(updated.sessionId, COWORK_EVENTS.WORKSPACE_SESSION_UPDATED, {
        sessionId: updated.sessionId,
        workspaceSession: updated,
      });
    }

    if (endedChanged && updated.endedAt) {
      this.events.publish(updated.sessionId, COWORK_EVENTS.WORKSPACE_SESSION_ENDED, {
        sessionId: updated.sessionId,
        workspaceSessionId: updated.workspaceSessionId,
        endedAt: updated.endedAt,
      });
    }
  }
}

function toWorkspaceEventInput(
  event: WorkspaceEvent,
  session: CoworkWorkspaceSession
): CoworkWorkspaceEventInput {
  return {
    workspaceSessionId: session.workspaceSessionId,
    sessionId: session.sessionId,
    kind: event.type as CoworkWorkspaceEvent["kind"],
    payload: event.payload,
    timestamp: event.timestamp,
  };
}

function resolveStatusUpdate(
  events: WorkspaceEvent[]
): { status: CoworkWorkspaceSession["status"]; timestamp: number } | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event.type !== "status") {
      continue;
    }
    const payload = event.payload;
    const status = typeof payload.status === "string" ? payload.status : undefined;
    if (!status || !STATUS_VALUES.includes(status as CoworkWorkspaceSession["status"])) {
      continue;
    }
    return {
      status: status as CoworkWorkspaceSession["status"],
      timestamp: event.timestamp,
    };
  }
  return null;
}
