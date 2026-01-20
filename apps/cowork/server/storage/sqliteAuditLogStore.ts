/**
 * SQLite-based audit log store.
 * Persists all tool actions, policy decisions, and approval events.
 */

import type { CoworkRiskTag } from "@ku0/agent-runtime";
import { getDatabase } from "./database";
import type { CoworkAuditAction, CoworkAuditEntry, CoworkAuditFilter } from "./types";

export interface AuditLogStoreLike {
  log(entry: CoworkAuditEntry): Promise<void>;
  getBySession(sessionId: string, filter?: CoworkAuditFilter): Promise<CoworkAuditEntry[]>;
  getByTask(taskId: string): Promise<CoworkAuditEntry[]>;
  query(filter: CoworkAuditFilter): Promise<CoworkAuditEntry[]>;
  getStats(sessionId: string): Promise<AuditLogStats>;
}

export interface AuditLogStats {
  total: number;
  byAction: Record<string, number>;
  byTool: Record<string, number>;
  byOutcome: Record<string, number>;
}

function parseRiskTags(raw: string | null): CoworkRiskTag[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as CoworkRiskTag[]) : [];
  } catch {
    return [];
  }
}

function parseJson(raw: string | null): Record<string, unknown> | undefined {
  if (!raw) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function rowToEntry(row: Record<string, unknown>): CoworkAuditEntry {
  return {
    entryId: row.entry_id as string,
    sessionId: row.session_id as string,
    taskId: row.task_id ? (row.task_id as string) : undefined,
    timestamp: row.timestamp as number,
    action: row.action as CoworkAuditAction,
    toolName: row.tool_name ? (row.tool_name as string) : undefined,
    input: parseJson(row.input as string | null),
    output: parseJson(row.output as string | null),
    policyDecision: row.decision
      ? (row.decision as "allow" | "allow_with_confirm" | "deny")
      : undefined,
    policyRuleId: row.rule_id ? (row.rule_id as string) : undefined,
    riskTags: parseRiskTags(row.risk_tags as string | null),
    riskScore:
      row.risk_score === null || row.risk_score === undefined
        ? undefined
        : (row.risk_score as number),
    reason: row.reason ? (row.reason as string) : undefined,
    durationMs: row.duration_ms ? (row.duration_ms as number) : undefined,
    outcome: row.outcome ? (row.outcome as "success" | "error" | "denied") : undefined,
  };
}

function buildFilterConditions(filter: CoworkAuditFilter): {
  conditions: string[];
  params: Record<string, unknown>;
} {
  const conditions: string[] = [];
  const params: Record<string, unknown> = {};

  if (filter.sessionId) {
    conditions.push("session_id = $sessionId");
    params.$sessionId = filter.sessionId;
  }
  if (filter.taskId) {
    conditions.push("task_id = $taskId");
    params.$taskId = filter.taskId;
  }
  if (filter.toolName) {
    conditions.push("tool_name = $toolName");
    params.$toolName = filter.toolName;
  }
  if (filter.action) {
    conditions.push("action = $action");
    params.$action = filter.action;
  }
  if (filter.since !== undefined) {
    conditions.push("timestamp >= $since");
    params.$since = filter.since;
  }
  if (filter.until !== undefined) {
    conditions.push("timestamp <= $until");
    params.$until = filter.until;
  }

  return { conditions, params };
}

export async function createSqliteAuditLogStore(): Promise<AuditLogStoreLike> {
  const db = await getDatabase();

  const insertStmt = db.prepare(`
    INSERT INTO audit_logs
    (entry_id, session_id, task_id, timestamp, action, tool_name, input, output,
     decision, rule_id, risk_tags, risk_score, reason, duration_ms, outcome)
    VALUES ($entryId, $sessionId, $taskId, $timestamp, $action, $toolName, $input, $output,
            $decision, $ruleId, $riskTags, $riskScore, $reason, $durationMs, $outcome)
  `);

  const selectBySessionStmt = db.prepare(`
    SELECT * FROM audit_logs
    WHERE session_id = $sessionId
    ORDER BY timestamp DESC
    LIMIT $limit OFFSET $offset
  `);

  const selectByTaskStmt = db.prepare(`
    SELECT * FROM audit_logs
    WHERE task_id = $taskId
    ORDER BY timestamp DESC
  `);

  const statsStmt = db.prepare(`
    SELECT
      COUNT(*) as total,
      action,
      tool_name,
      outcome
    FROM audit_logs
    WHERE session_id = $sessionId
    GROUP BY action, tool_name, outcome
  `);

  return {
    async log(entry: CoworkAuditEntry): Promise<void> {
      insertStmt.run({
        $entryId: entry.entryId,
        $sessionId: entry.sessionId,
        $taskId: entry.taskId ?? null,
        $timestamp: entry.timestamp,
        $action: entry.action,
        $toolName: entry.toolName ?? null,
        $input: entry.input ? JSON.stringify(entry.input) : null,
        $output: entry.output ? JSON.stringify(entry.output) : null,
        $decision: entry.policyDecision ?? null,
        $ruleId: entry.policyRuleId ?? null,
        $riskTags: JSON.stringify(entry.riskTags ?? []),
        $riskScore: entry.riskScore ?? null,
        $reason: entry.reason ?? null,
        $durationMs: entry.durationMs ?? null,
        $outcome: entry.outcome ?? null,
      });
    },

    async getBySession(sessionId: string, filter?: CoworkAuditFilter): Promise<CoworkAuditEntry[]> {
      const limit = filter?.limit ?? 1000;
      const offset = filter?.offset ?? 0;
      const rows = selectBySessionStmt.all({
        $sessionId: sessionId,
        $limit: limit,
        $offset: offset,
      }) as Record<string, unknown>[];
      return rows.map(rowToEntry);
    },

    async getByTask(taskId: string): Promise<CoworkAuditEntry[]> {
      const rows = selectByTaskStmt.all({ $taskId: taskId }) as Record<string, unknown>[];
      return rows.map(rowToEntry);
    },

    async query(filter: CoworkAuditFilter): Promise<CoworkAuditEntry[]> {
      const { conditions, params } = buildFilterConditions(filter);

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      const limit = filter.limit ?? 1000;
      const offset = filter.offset ?? 0;

      const query = `
        SELECT * FROM audit_logs
        ${whereClause}
        ORDER BY timestamp DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

      const stmt = db.prepare(query);
      const rows = stmt.all(params) as Record<string, unknown>[];
      return rows.map(rowToEntry);
    },

    async getStats(sessionId: string): Promise<AuditLogStats> {
      const rows = statsStmt.all({ $sessionId: sessionId }) as Array<{
        total: number;
        action: string;
        tool_name: string | null;
        outcome: string | null;
      }>;

      const byAction: Record<string, number> = {};
      const byTool: Record<string, number> = {};
      const byOutcome: Record<string, number> = {};
      let total = 0;

      for (const row of rows) {
        total += row.total;

        byAction[row.action] = (byAction[row.action] ?? 0) + row.total;

        if (row.tool_name) {
          byTool[row.tool_name] = (byTool[row.tool_name] ?? 0) + row.total;
        }

        if (row.outcome) {
          byOutcome[row.outcome] = (byOutcome[row.outcome] ?? 0) + row.total;
        }
      }

      return { total, byAction, byTool, byOutcome };
    },
  };
}
