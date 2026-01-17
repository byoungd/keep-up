/**
 * JSON-based audit log store for development.
 * For production, use the SQLite-based store.
 */

import type { AuditLogStoreLike } from "./contracts";
import { JsonStore } from "./jsonStore";
import type { CoworkAuditEntry, CoworkAuditFilter } from "./types";

export type AuditLogStore = AuditLogStoreLike;

function applyAuditFilter(
  entries: CoworkAuditEntry[],
  filter: CoworkAuditFilter
): CoworkAuditEntry[] {
  let filtered = entries;

  if (filter.sessionId) {
    filtered = filtered.filter((e) => e.sessionId === filter.sessionId);
  }
  if (filter.taskId) {
    filtered = filtered.filter((e) => e.taskId === filter.taskId);
  }
  if (filter.toolName) {
    filtered = filtered.filter((e) => e.toolName === filter.toolName);
  }
  if (filter.action) {
    filtered = filtered.filter((e) => e.action === filter.action);
  }
  const since = filter.since;
  const until = filter.until;
  if (since !== undefined) {
    filtered = filtered.filter((e) => e.timestamp >= since);
  }
  if (until !== undefined) {
    filtered = filtered.filter((e) => e.timestamp <= until);
  }

  return filtered;
}

export function createAuditLogStore(filePath: string): AuditLogStore {
  const store = new JsonStore<CoworkAuditEntry>({ filePath, idKey: "entryId" });

  return {
    async log(entry: CoworkAuditEntry): Promise<void> {
      await store.upsert(entry);
    },

    async getBySession(sessionId: string, filter?: CoworkAuditFilter): Promise<CoworkAuditEntry[]> {
      const all = await store.getAll();
      let filtered = all.filter((e) => e.sessionId === sessionId);

      const since = filter?.since;
      const until = filter?.until;
      if (since !== undefined) {
        filtered = filtered.filter((e) => e.timestamp >= since);
      }
      if (until !== undefined) {
        filtered = filtered.filter((e) => e.timestamp <= until);
      }

      filtered.sort((a, b) => b.timestamp - a.timestamp);

      const offset = filter?.offset ?? 0;
      const limit = filter?.limit ?? 1000;
      return filtered.slice(offset, offset + limit);
    },

    async getByTask(taskId: string): Promise<CoworkAuditEntry[]> {
      const all = await store.getAll();
      return all.filter((e) => e.taskId === taskId).sort((a, b) => b.timestamp - a.timestamp);
    },

    async query(filter: CoworkAuditFilter): Promise<CoworkAuditEntry[]> {
      const all = await store.getAll();
      const filtered = applyAuditFilter(all, filter);

      filtered.sort((a, b) => b.timestamp - a.timestamp);

      const offset = filter.offset ?? 0;
      const limit = filter.limit ?? 1000;
      return filtered.slice(offset, offset + limit);
    },

    async getStats(sessionId: string): Promise<{
      total: number;
      byAction: Record<string, number>;
      byTool: Record<string, number>;
      byOutcome: Record<string, number>;
    }> {
      const all = await store.getAll();
      const entries = all.filter((e) => e.sessionId === sessionId);

      const byAction: Record<string, number> = {};
      const byTool: Record<string, number> = {};
      const byOutcome: Record<string, number> = {};

      for (const entry of entries) {
        byAction[entry.action] = (byAction[entry.action] ?? 0) + 1;

        if (entry.toolName) {
          byTool[entry.toolName] = (byTool[entry.toolName] ?? 0) + 1;
        }

        if (entry.outcome) {
          byOutcome[entry.outcome] = (byOutcome[entry.outcome] ?? 0) + 1;
        }
      }

      return {
        total: entries.length,
        byAction,
        byTool,
        byOutcome,
      };
    },
  };
}
