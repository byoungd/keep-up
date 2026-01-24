import type { AuditEntry, AuditFilter, AuditLogger, ToolEvent } from "@ku0/agent-runtime-core";
import { hashPayload } from "./hash";
import type { PersistenceStore } from "./types";

type PendingToolCall = {
  inputHash: string;
  startedAt: number;
};

export class PersistentAuditLogger implements AuditLogger {
  private readonly pendingCalls = new Map<string, PendingToolCall>();

  constructor(
    private readonly store: PersistenceStore,
    private readonly delegate?: AuditLogger
  ) {}

  log(entry: AuditEntry): void {
    this.delegate?.log(entry);

    if (entry.action === "call") {
      this.trackToolCall(entry);
      return;
    }

    if (entry.action !== "result" && entry.action !== "error") {
      return;
    }

    this.recordToolOutcome(entry);
  }

  private trackToolCall(entry: AuditEntry): void {
    const toolCallId = parseToolCallId(entry.entryId);
    if (!toolCallId) {
      return;
    }
    this.pendingCalls.set(toolCallId, {
      inputHash: hashPayload(entry.input ?? {}),
      startedAt: entry.timestamp,
    });
  }

  private recordToolOutcome(entry: AuditEntry): void {
    const toolCallId = parseToolCallId(entry.entryId);
    const pending = toolCallId ? this.pendingCalls.get(toolCallId) : undefined;
    if (toolCallId) {
      this.pendingCalls.delete(toolCallId);
    }

    const inputHash = pending?.inputHash ?? hashPayload(entry.input ?? {});
    const outputHash = hashPayload(entry.output ?? entry.error ?? {});
    const durationMs = entry.durationMs ?? (pending ? entry.timestamp - pending.startedAt : 0);

    const eventId = entry.entryId ?? buildFallbackEventId(entry, toolCallId);
    const runId = entry.correlationId ?? entry.taskId ?? "unknown";
    const toolEvent: ToolEvent = {
      eventId,
      runId,
      toolId: entry.toolName,
      inputHash,
      outputHash,
      durationMs,
      createdAt: entry.timestamp,
    };

    try {
      this.store.saveToolEvent(toolEvent);
    } catch {
      // Fail-open: audit persistence should not break runtime execution.
    }
  }

  getEntries(filter?: AuditFilter): AuditEntry[] {
    return this.delegate?.getEntries(filter) ?? [];
  }
}

function parseToolCallId(entryId?: string): string | undefined {
  if (!entryId) {
    return undefined;
  }
  const [toolCallId] = entryId.split(":");
  return toolCallId || undefined;
}

function buildFallbackEventId(entry: AuditEntry, toolCallId?: string): string {
  if (toolCallId) {
    return `${toolCallId}:${entry.action}`;
  }
  return `tool_${entry.toolName}_${entry.timestamp}`;
}
