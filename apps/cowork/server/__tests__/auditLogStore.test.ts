import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createAuditLogStore } from "../storage/auditLogStore";
import type { CoworkAuditEntry } from "../storage/types";

function createEntry(overrides: Partial<CoworkAuditEntry> = {}): CoworkAuditEntry {
  return {
    entryId: crypto.randomUUID(),
    sessionId: "session-1",
    timestamp: Date.now(),
    action: "tool_call",
    toolName: "file:read",
    ...overrides,
  };
}

describe("AuditLogStore", () => {
  it("logs and retrieves entries by session", async () => {
    const dir = await mkdtemp(join(tmpdir(), "audit-test-"));
    try {
      const store = createAuditLogStore(join(dir, "audit.json"));
      const entry1 = createEntry({ sessionId: "session-1", toolName: "file:read" });
      const entry2 = createEntry({ sessionId: "session-1", toolName: "file:write" });
      const entry3 = createEntry({ sessionId: "session-2", toolName: "bash:run" });

      await store.log(entry1);
      await store.log(entry2);
      await store.log(entry3);

      const session1Entries = await store.getBySession("session-1");
      expect(session1Entries).toHaveLength(2);
      expect(session1Entries.map((e) => e.toolName)).toContain("file:read");
      expect(session1Entries.map((e) => e.toolName)).toContain("file:write");

      const session2Entries = await store.getBySession("session-2");
      expect(session2Entries).toHaveLength(1);
      expect(session2Entries[0].toolName).toBe("bash:run");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("retrieves entries by task", async () => {
    const dir = await mkdtemp(join(tmpdir(), "audit-test-"));
    try {
      const store = createAuditLogStore(join(dir, "audit.json"));
      const entry1 = createEntry({ taskId: "task-1", action: "tool_call" });
      const entry2 = createEntry({ taskId: "task-1", action: "tool_result" });
      const entry3 = createEntry({ taskId: "task-2", action: "tool_call" });

      await store.log(entry1);
      await store.log(entry2);
      await store.log(entry3);

      const task1Entries = await store.getByTask("task-1");
      expect(task1Entries).toHaveLength(2);

      const task2Entries = await store.getByTask("task-2");
      expect(task2Entries).toHaveLength(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("queries with filters", async () => {
    const dir = await mkdtemp(join(tmpdir(), "audit-test-"));
    try {
      const store = createAuditLogStore(join(dir, "audit.json"));
      const now = Date.now();
      const entry1 = createEntry({ action: "tool_call", timestamp: now - 1000 });
      const entry2 = createEntry({ action: "tool_result", timestamp: now });
      const entry3 = createEntry({ action: "approval_requested", timestamp: now + 1000 });

      await store.log(entry1);
      await store.log(entry2);
      await store.log(entry3);

      const toolCalls = await store.query({ action: "tool_call" });
      expect(toolCalls).toHaveLength(1);
      expect(toolCalls[0].action).toBe("tool_call");

      const recent = await store.query({ since: now });
      expect(recent).toHaveLength(2);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("computes stats by session", async () => {
    const dir = await mkdtemp(join(tmpdir(), "audit-test-"));
    try {
      const store = createAuditLogStore(join(dir, "audit.json"));
      await store.log(
        createEntry({ action: "tool_call", toolName: "file:read", outcome: "success" })
      );
      await store.log(
        createEntry({ action: "tool_call", toolName: "file:write", outcome: "success" })
      );
      await store.log(
        createEntry({ action: "tool_error", toolName: "bash:run", outcome: "error" })
      );

      const stats = await store.getStats("session-1");
      expect(stats.total).toBe(3);
      expect(stats.byAction.tool_call).toBe(2);
      expect(stats.byAction.tool_error).toBe(1);
      expect(stats.byOutcome.success).toBe(2);
      expect(stats.byOutcome.error).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
