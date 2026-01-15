/**
 * SQLite-based approval store.
 * Drop-in replacement for JsonStore-based ApprovalStore.
 */

import { getDatabase } from "./database";
import type { CoworkApproval } from "./types";

export interface SqliteApprovalStore {
  getAll(): Promise<CoworkApproval[]>;
  getById(approvalId: string): Promise<CoworkApproval | null>;
  getBySession(sessionId: string): Promise<CoworkApproval[]>;
  create(approval: CoworkApproval): Promise<CoworkApproval>;
  update(
    approvalId: string,
    updater: (approval: CoworkApproval) => CoworkApproval
  ): Promise<CoworkApproval | null>;
}

function parseRiskTags(raw: string): CoworkApproval["riskTags"] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as CoworkApproval["riskTags"]) : [];
  } catch {
    return [];
  }
}

export async function createSqliteApprovalStore(): Promise<SqliteApprovalStore> {
  const db = await getDatabase();

  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO approvals
    (approval_id, session_id, action, risk_tags, reason, status, created_at, resolved_at)
    VALUES ($approvalId, $sessionId, $action, $riskTags, $reason, $status, $createdAt, $resolvedAt)
  `);

  const selectAllStmt = db.prepare(`
    SELECT * FROM approvals ORDER BY created_at DESC
  `);

  const selectByIdStmt = db.prepare(`
    SELECT * FROM approvals WHERE approval_id = $approvalId
  `);

  const selectBySessionStmt = db.prepare(`
    SELECT * FROM approvals WHERE session_id = $sessionId ORDER BY created_at DESC
  `);

  const updateStmt = db.prepare(`
    UPDATE approvals
    SET session_id = $sessionId,
        action = $action,
        risk_tags = $riskTags,
        reason = $reason,
        status = $status,
        created_at = $createdAt,
        resolved_at = $resolvedAt
    WHERE approval_id = $approvalId
  `);

  function rowToApproval(row: Record<string, unknown>): CoworkApproval {
    return {
      approvalId: row.approval_id as string,
      sessionId: row.session_id as string,
      action: row.action as string,
      riskTags: parseRiskTags(row.risk_tags as string),
      reason: row.reason ? (row.reason as string) : undefined,
      status: row.status as CoworkApproval["status"],
      createdAt: row.created_at as number,
      resolvedAt: row.resolved_at ? (row.resolved_at as number) : undefined,
    };
  }

  function getById(approvalId: string): CoworkApproval | null {
    const row = selectByIdStmt.get({ $approvalId: approvalId }) as Record<string, unknown> | null;
    return row ? rowToApproval(row) : null;
  }

  return {
    async getAll(): Promise<CoworkApproval[]> {
      const rows = selectAllStmt.all() as Record<string, unknown>[];
      return rows.map(rowToApproval);
    },

    async getById(approvalId: string): Promise<CoworkApproval | null> {
      return getById(approvalId);
    },

    async getBySession(sessionId: string): Promise<CoworkApproval[]> {
      const rows = selectBySessionStmt.all({ $sessionId: sessionId }) as Record<string, unknown>[];
      return rows.map(rowToApproval);
    },

    async create(approval: CoworkApproval): Promise<CoworkApproval> {
      insertStmt.run({
        $approvalId: approval.approvalId,
        $sessionId: approval.sessionId,
        $action: approval.action,
        $riskTags: JSON.stringify(approval.riskTags ?? []),
        $reason: approval.reason ?? null,
        $status: approval.status,
        $createdAt: approval.createdAt,
        $resolvedAt: approval.resolvedAt ?? null,
      });
      return approval;
    },

    async update(
      approvalId: string,
      updater: (approval: CoworkApproval) => CoworkApproval
    ): Promise<CoworkApproval | null> {
      const existing = getById(approvalId);
      if (!existing) {
        return null;
      }

      const updated = updater(existing);
      updateStmt.run({
        $approvalId: updated.approvalId,
        $sessionId: updated.sessionId,
        $action: updated.action,
        $riskTags: JSON.stringify(updated.riskTags ?? []),
        $reason: updated.reason ?? null,
        $status: updated.status,
        $createdAt: updated.createdAt,
        $resolvedAt: updated.resolvedAt ?? null,
      });
      return updated;
    },
  };
}
