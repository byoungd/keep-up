/**
 * Audit Integration Tests
 *
 * Tests for audit logging and query functionality.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { beforeEach, describe, expect, it } from "vitest";
import { AuditRoutes } from "../api/auditRoutes";
import { AuditLogger } from "../audit/auditLogger";
import { MemoryAuditStore } from "../audit/memoryAuditStore";

describe("Audit Integration Tests", () => {
  let auditStore: MemoryAuditStore;
  let auditLogger: AuditLogger;
  let auditRoutes: AuditRoutes;

  beforeEach(async () => {
    auditStore = new MemoryAuditStore();
    // Use larger batch size to avoid auto-flush during tests
    auditLogger = new AuditLogger({ store: auditStore, batchSize: 100, flushIntervalMs: 60000 });
    auditRoutes = new AuditRoutes(auditStore);
  });

  describe("Audit event logging", () => {
    it("logs JOIN/LEAVE/UPDATE/ERROR events", async () => {
      // Log various events
      auditLogger.log({
        docId: "doc1",
        actorId: "user1",
        role: "editor",
        eventType: "JOIN",
        connectionId: "conn1",
      });
      await auditLogger.flush();

      auditLogger.log({
        docId: "doc1",
        actorId: "user1",
        role: "editor",
        eventType: "UPDATE",
        updateBytesLen: 100,
        connectionId: "conn1",
      });
      await auditLogger.flush();

      auditLogger.log({
        docId: "doc1",
        actorId: "user2",
        role: "viewer",
        eventType: "ERROR",
        errorCode: "PERMISSION_DENIED",
        connectionId: "conn2",
      });
      await auditLogger.flush();

      auditLogger.log({
        docId: "doc1",
        actorId: "user1",
        role: "editor",
        eventType: "LEAVE",
        connectionId: "conn1",
      });
      await auditLogger.flush();

      const events = await auditStore.query({ docId: "doc1" });
      expect(events.length).toBe(4);

      const eventTypes = events.map((e) => e.eventType);
      expect(eventTypes).toContain("JOIN");
      expect(eventTypes).toContain("LEAVE");
      expect(eventTypes).toContain("UPDATE");
      expect(eventTypes).toContain("ERROR");
    });

    it("no content is stored in audit events", async () => {
      auditLogger.log({
        docId: "doc1",
        actorId: "user1",
        role: "editor",
        eventType: "UPDATE",
        updateBytesLen: 1000,
        connectionId: "conn1",
      });

      await auditLogger.flush();

      const events = await auditStore.query({ docId: "doc1" });
      expect(events.length).toBe(1);

      const event = events[0];
      // Verify no content fields exist
      expect(event).not.toHaveProperty("content");
      expect(event).not.toHaveProperty("bytesB64");
      expect(event).not.toHaveProperty("data");
      expect(event).not.toHaveProperty("payload");

      // Only metadata should be present
      expect(event.updateBytesLen).toBe(1000);
      expect(event.docId).toBe("doc1");
      expect(event.actorId).toBe("user1");
    });
  });

  describe("Audit query filtering", () => {
    beforeEach(async () => {
      // Seed test data
      const _baseTime = Date.now();

      auditLogger.log({
        docId: "doc1",
        actorId: "user1",
        role: "editor",
        eventType: "JOIN",
        connectionId: "conn1",
      });

      auditLogger.log({
        docId: "doc1",
        actorId: "user1",
        role: "editor",
        eventType: "UPDATE",
        updateBytesLen: 50,
        connectionId: "conn1",
      });

      auditLogger.log({
        docId: "doc2",
        actorId: "user2",
        role: "viewer",
        eventType: "JOIN",
        connectionId: "conn2",
      });

      auditLogger.log({
        docId: "doc1",
        actorId: "user2",
        role: "viewer",
        eventType: "ERROR",
        errorCode: "PERMISSION_DENIED",
        connectionId: "conn3",
      });

      await auditLogger.flush();
    });

    it("filters by docId", async () => {
      const events = await auditStore.query({ docId: "doc1" });
      expect(events.length).toBe(3);
      expect(events.every((e) => e.docId === "doc1")).toBe(true);
    });

    it("filters by eventType", async () => {
      const events = await auditStore.query({ eventType: "JOIN" });
      expect(events.length).toBe(2);
      expect(events.every((e) => e.eventType === "JOIN")).toBe(true);
    });

    it("filters by actorId", async () => {
      const events = await auditStore.query({ actorId: "user1" });
      expect(events.length).toBe(2);
      expect(events.every((e) => e.actorId === "user1")).toBe(true);
    });

    it("combines multiple filters", async () => {
      const events = await auditStore.query({ docId: "doc1", eventType: "UPDATE" });
      expect(events.length).toBe(1);
      expect(events[0].docId).toBe("doc1");
      expect(events[0].eventType).toBe("UPDATE");
    });

    it("returns events in chronological order", async () => {
      const events = await auditStore.query({ docId: "doc1" });
      for (let i = 1; i < events.length; i++) {
        expect(events[i].ts).toBeGreaterThanOrEqual(events[i - 1].ts);
      }
    });

    it("respects limit parameter", async () => {
      const events = await auditStore.query({ limit: 2 });
      expect(events.length).toBe(2);
    });

    it("respects offset parameter", async () => {
      const allEvents = await auditStore.query({});
      const offsetEvents = await auditStore.query({ offset: 2 });

      expect(offsetEvents.length).toBe(allEvents.length - 2);
      expect(offsetEvents[0].eventId).toBe(allEvents[2].eventId);
    });
  });

  describe("Audit API routes", () => {
    beforeEach(async () => {
      auditLogger.log({
        docId: "doc1",
        actorId: "user1",
        role: "editor",
        eventType: "JOIN",
        connectionId: "conn1",
      });

      auditLogger.log({
        docId: "doc1",
        actorId: "user1",
        role: "editor",
        eventType: "UPDATE",
        updateBytesLen: 100,
        connectionId: "conn1",
      });

      await auditLogger.flush();
    });

    it("handles query request with filters", async () => {
      let responseData: unknown;
      let responseStatus: number;

      const mockReq = {
        url: "/audit?docId=doc1&eventType=UPDATE",
        headers: { host: "localhost" },
      } as IncomingMessage;

      const mockRes = {} as ServerResponse;

      const sendJson = (_res: ServerResponse, status: number, payload: unknown) => {
        responseStatus = status;
        responseData = payload;
      };

      await auditRoutes.handleQuery(mockReq, mockRes, sendJson);

      expect(responseStatus ?? 0).toBe(200);
      expect((responseData as { ok: boolean }).ok).toBe(true);
      expect((responseData as { events: unknown[] }).events.length).toBe(1);
      expect((responseData as { events: Array<{ eventType: string }> }).events[0].eventType).toBe(
        "UPDATE"
      );
    });

    it("handles pagination", async () => {
      // Add more events
      for (let i = 0; i < 5; i++) {
        auditLogger.log({
          docId: "doc1",
          actorId: "user1",
          role: "editor",
          eventType: "UPDATE",
          updateBytesLen: i * 10,
          connectionId: `conn-${i}`,
        });
      }
      await auditLogger.flush();

      let responseData: unknown;

      const mockReq = {
        url: "/audit?docId=doc1&limit=3",
        headers: { host: "localhost" },
      } as IncomingMessage;

      const mockRes = {} as ServerResponse;

      const sendJson = (_res: ServerResponse, _status: number, payload: unknown) => {
        responseData = payload;
      };

      await auditRoutes.handleQuery(mockReq, mockRes, sendJson);

      expect((responseData as { ok: boolean }).ok).toBe(true);
      expect((responseData as { events: unknown[] }).events.length).toBe(3);
      expect((responseData as { hasMore: boolean }).hasMore).toBe(true);
    });
  });
});
