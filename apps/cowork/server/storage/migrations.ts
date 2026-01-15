/**
 * Helpers for migrating JSON-backed stores to SQLite.
 */

import { join } from "node:path";
import { ApprovalStore } from "./approvalStore";
import { ConfigStore } from "./configStore";
import { getDatabase } from "./database";
import { SessionStore } from "./sessionStore";
import { ensureStateDir } from "./statePaths";
import { TaskStore } from "./taskStore";
import type { CoworkSettings } from "./types";

export interface MigrationResult {
  sessions: number;
  tasks: number;
  approvals: number;
  settings: number;
}

export interface MigrationOptions {
  stateDir?: string;
  dryRun?: boolean;
}

function toSettingsEntries(settings: CoworkSettings): Array<[string, string]> {
  const entries: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(settings)) {
    entries.push([key, JSON.stringify(value ?? "")]);
  }
  return entries;
}

export async function migrateJsonToSqlite(
  options: MigrationOptions = {}
): Promise<MigrationResult> {
  const stateDir = options.stateDir ?? (await ensureStateDir());

  const sessionStore = new SessionStore(join(stateDir, "sessions.json"));
  const taskStore = new TaskStore(join(stateDir, "tasks.json"));
  const approvalStore = new ApprovalStore(join(stateDir, "approvals.json"));
  const configStore = new ConfigStore(join(stateDir, "settings.json"));

  const [sessions, tasks, approvals, settings] = await Promise.all([
    sessionStore.getAll(),
    taskStore.getAll(),
    approvalStore.getAll(),
    configStore.get(),
  ]);

  const result: MigrationResult = {
    sessions: sessions.length,
    tasks: tasks.length,
    approvals: approvals.length,
    settings: Object.keys(settings).length,
  };

  if (options.dryRun) {
    return result;
  }

  const db = await getDatabase();
  const insertSession = db.prepare(`
    INSERT OR REPLACE INTO sessions
    (session_id, user_id, device_id, platform, mode, grants, connectors, created_at, ended_at)
    VALUES ($sessionId, $userId, $deviceId, $platform, $mode, $grants, $connectors, $createdAt, $endedAt)
  `);

  const insertTask = db.prepare(`
    INSERT OR REPLACE INTO tasks
    (task_id, session_id, title, prompt, status, created_at, updated_at)
    VALUES ($taskId, $sessionId, $title, $prompt, $status, $createdAt, $updatedAt)
  `);

  const insertApproval = db.prepare(`
    INSERT OR REPLACE INTO approvals
    (approval_id, session_id, action, risk_tags, reason, status, created_at, resolved_at)
    VALUES ($approvalId, $sessionId, $action, $riskTags, $reason, $status, $createdAt, $resolvedAt)
  `);

  const insertSetting = db.prepare(`
    INSERT OR REPLACE INTO settings (key, value)
    VALUES ($key, $value)
  `);

  db.run("BEGIN");
  try {
    for (const session of sessions) {
      insertSession.run({
        $sessionId: session.sessionId,
        $userId: session.userId,
        $deviceId: session.deviceId,
        $platform: session.platform,
        $mode: session.mode,
        $grants: JSON.stringify(session.grants),
        $connectors: JSON.stringify(session.connectors),
        $createdAt: session.createdAt,
        $endedAt: null,
      });
    }

    for (const task of tasks) {
      insertTask.run({
        $taskId: task.taskId,
        $sessionId: task.sessionId,
        $title: task.title,
        $prompt: task.prompt,
        $status: task.status,
        $createdAt: task.createdAt,
        $updatedAt: task.updatedAt,
      });
    }

    for (const approval of approvals) {
      insertApproval.run({
        $approvalId: approval.approvalId,
        $sessionId: approval.sessionId,
        $action: approval.action,
        $riskTags: JSON.stringify(approval.riskTags ?? []),
        $reason: approval.reason ?? null,
        $status: approval.status,
        $createdAt: approval.createdAt,
        $resolvedAt: approval.resolvedAt ?? null,
      });
    }

    for (const [key, value] of toSettingsEntries(settings)) {
      insertSetting.run({ $key: key, $value: value });
    }

    db.run("COMMIT");
  } catch (error) {
    db.run("ROLLBACK");
    throw error;
  }

  return result;
}
