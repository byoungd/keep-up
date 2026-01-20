import type { AuditEntry, AuditFilter, AuditLogger } from "@ku0/agent-runtime";
import { normalizeCoworkRiskTags } from "@ku0/agent-runtime";
import type { AuditLogStoreLike } from "../storage/contracts";
import type { CoworkAuditAction, CoworkAuditEntry } from "../storage/types";

const DEFAULT_MAX_ENTRIES = 10_000;

export interface CoworkAuditLoggerOptions {
  auditLogStore?: AuditLogStoreLike;
  maxEntries?: number;
}

export class CoworkAuditLogger implements AuditLogger {
  private entries: AuditEntry[] = [];
  private readonly auditLogStore?: AuditLogStoreLike;
  private readonly maxEntries: number;

  constructor(options: CoworkAuditLoggerOptions = {}) {
    this.auditLogStore = options.auditLogStore;
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  }

  log(entry: AuditEntry): void {
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }

    const mapped = mapAuditEntry(entry);
    if (mapped && this.auditLogStore) {
      void this.auditLogStore.log(mapped).catch((error) => {
        void error;
      });
    }
  }

  getEntries(filter?: AuditFilter): AuditEntry[] {
    let result = [...this.entries];

    if (filter) {
      if (filter.toolName) {
        result = result.filter((e) => e.toolName === filter.toolName);
      }
      if (filter.userId) {
        result = result.filter((e) => e.userId === filter.userId);
      }
      if (filter.correlationId) {
        result = result.filter((e) => e.correlationId === filter.correlationId);
      }
      const since = filter.since;
      if (since !== undefined) {
        result = result.filter((e) => e.timestamp >= since);
      }
      const until = filter.until;
      if (until !== undefined) {
        result = result.filter((e) => e.timestamp <= until);
      }
      if (filter.action) {
        result = result.filter((e) => e.action === filter.action);
      }
    }

    return result;
  }
}

function mapAuditEntry(entry: AuditEntry): CoworkAuditEntry | null {
  if (!entry.sessionId) {
    return null;
  }

  const action = mapAuditAction(entry.action);
  if (!action) {
    return null;
  }

  return {
    entryId: entry.entryId ?? crypto.randomUUID(),
    sessionId: entry.sessionId,
    taskId: entry.taskId,
    timestamp: entry.timestamp,
    action,
    toolName: entry.toolName,
    input: entry.input,
    output: entry.output,
    policyDecision: entry.policyDecision,
    policyRuleId: entry.policyRuleId,
    riskTags: normalizeCoworkRiskTags(entry.riskTags),
    riskScore: entry.riskScore,
    reason: entry.reason,
    durationMs: entry.durationMs,
    outcome: resolveOutcome(action, entry),
  };
}

function mapAuditAction(action: AuditEntry["action"]): CoworkAuditAction | null {
  switch (action) {
    case "call":
      return "tool_call";
    case "result":
      return "tool_result";
    case "error":
      return "tool_error";
    case "policy":
      return "policy_decision";
    default:
      return null;
  }
}

function resolveOutcome(action: CoworkAuditAction, entry: AuditEntry): CoworkAuditEntry["outcome"] {
  if (action === "tool_error") {
    return "error";
  }
  if (action === "tool_result") {
    return "success";
  }
  if (action === "policy_decision") {
    return entry.policyDecision === "deny" ? "denied" : "success";
  }
  return undefined;
}
