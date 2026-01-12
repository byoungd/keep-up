/**
 * LFCC v0.9 RC - Sync Server Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computePolicyManifestHash } from "../../kernel/policy";
import type { AuthAdapter } from "../../security/auth";
import { createDefaultSyncManifest } from "../negotiate";
import {
  type CatchUpResponsePayload,
  type HandshakeAckPayload,
  type HandshakePayload,
  type PresenceAckPayload,
  type PresencePayload,
  createMessage,
  deserializeMessage,
  serializeMessage,
} from "../protocol";
import { type PersistenceHooks, SyncServer, type WebSocketLike } from "../server";
import { validateClientInboundMessage } from "../validation";

describe("Sync Server", () => {
  let server: SyncServer;
  let mockPersistence: PersistenceHooks;
  let sentMessages: string[];
  const manifest = createDefaultSyncManifest();
  const manifestHashPromise = computePolicyManifestHash(manifest);

  type MockWs = WebSocketLike & { closeEvents: Array<{ code?: number; reason?: string }> };

  function createMockWs(): MockWs {
    const closeEvents: Array<{ code?: number; reason?: string }> = [];
    return {
      send: (data: string) => {
        sentMessages.push(data);
      },
      close: (code?: number, reason?: string) => {
        closeEvents.push({ code, reason });
      },
      closeEvents,
    };
  }

  function parseClientMessage(raw: string) {
    const msg = deserializeMessage(raw);
    const validation = validateClientInboundMessage(msg);
    expect(validation.ok).toBe(true);
    if (!validation.ok) {
      throw new Error(validation.errors.join("; "));
    }
    return validation.message;
  }

  async function buildHandshakePayload(): Promise<HandshakePayload> {
    return {
      client_manifest_v09: manifest,
      client_manifest_hash: await manifestHashPromise,
      capabilities: {
        features: [],
        maxUpdateSize: 1000000,
        supportsBinary: true,
        supportsCompression: false,
      },
    };
  }

  beforeEach(() => {
    sentMessages = [];
    mockPersistence = {
      getUpdatesSince: async () => ({ data: new Uint8Array([1, 2, 3]), frontierTag: "v1" }),
      getSnapshot: async () => ({ data: new Uint8Array([1, 2, 3, 4, 5]), frontierTag: "v1" }),
      saveUpdate: async () => {
        // Mock save
      },
      getCurrentFrontierTag: async () => "v1",
    };
    server = new SyncServer({ enableNegotiationLog: true }, mockPersistence);
  });

  afterEach(() => {
    server.shutdown();
  });

  describe("handleMessage - handshake", () => {
    it("should accept valid handshake", async () => {
      const ws = createMockWs();
      server.handleConnection(ws, "doc-1");
      const payload = await buildHandshakePayload();

      const msg = createMessage("handshake", "doc-1", "client-1", payload);
      await server.handleMessage(ws, serializeMessage(msg));

      expect(sentMessages.length).toBe(1);
      const response = parseClientMessage(sentMessages[0]);
      expect(response.type).toBe("handshake_ack");
      const ackPayload = response.payload as HandshakeAckPayload;
      expect(ackPayload.effective_manifest_v09).toBeDefined();
      expect(ackPayload.sessionId).toBeDefined();
      expect(ackPayload.role).toBe("editor");
    });

    it("should reject handshake without handleConnection", async () => {
      const ws = createMockWs();
      const payload = await buildHandshakePayload();

      const msg = createMessage("handshake", "doc-1", "client-1", payload);
      await server.handleMessage(ws, serializeMessage(msg));

      expect(sentMessages.length).toBe(1);
      const response = parseClientMessage(sentMessages[0]);
      expect(response.type).toBe("error");
      expect(JSON.stringify(response.payload)).toContain("handleConnection");
    });

    it("should add client to room after handshake", async () => {
      const ws = createMockWs();
      server.handleConnection(ws, "doc-1");
      const payload = await buildHandshakePayload();

      await server.handleMessage(
        ws,
        serializeMessage(createMessage("handshake", "doc-1", "client-1", payload))
      );

      const room = server.getRoom("doc-1");
      expect(room).toBeDefined();
      expect(room?.clients.size).toBe(1);
      expect(room?.clients.has("client-1")).toBe(true);
    });

    it("should include negotiation log when enabled", async () => {
      const ws = createMockWs();
      server.handleConnection(ws, "doc-1");
      const payload = await buildHandshakePayload();

      const msg = createMessage("handshake", "doc-1", "client-1", payload);
      await server.handleMessage(ws, serializeMessage(msg));

      const response = parseClientMessage(sentMessages[0]);
      const ackPayload = response.payload as HandshakeAckPayload;
      expect(ackPayload.negotiationLog).toBeDefined();
      expect(Array.isArray(ackPayload.negotiationLog)).toBe(true);
    });
  });

  describe("handleMessage - presence", () => {
    it("should broadcast presence to all clients", async () => {
      const ws1 = createMockWs();
      const ws2 = createMockWs();
      server.handleConnection(ws1, "doc-1");
      server.handleConnection(ws2, "doc-1");

      const handshakePayload = await buildHandshakePayload();

      await server.handleMessage(
        ws1,
        serializeMessage(createMessage("handshake", "doc-1", "client-1", handshakePayload))
      );
      await server.handleMessage(
        ws2,
        serializeMessage(createMessage("handshake", "doc-1", "client-2", handshakePayload))
      );

      sentMessages = [];

      const presencePayload: PresencePayload = {
        userMeta: { userId: "u1", displayName: "User 1" },
        cursor: { blockId: "block-1", offset: 5 },
        status: "active" as const,
        lastActivity: new Date().toISOString(),
      };
      const presenceMsg = createMessage("presence", "doc-1", "client-1", presencePayload);

      await server.handleMessage(ws1, serializeMessage(presenceMsg));

      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(sentMessages.length).toBe(2);
      const response = parseClientMessage(sentMessages[0]);
      expect(response.type).toBe("presence_ack");
      const presenceAckPayload = response.payload as PresenceAckPayload;
      expect(presenceAckPayload.presences.length).toBe(1);
    });
  });

  describe("handleMessage - permissions", () => {
    it("should reject writes when authorize denies", async () => {
      const authAdapter: AuthAdapter = {
        authenticate: async () => ({ authenticated: true, userId: "u1", role: "viewer" }),
        authorize: async (_context, action) => action !== "write",
      };
      server = new SyncServer({ enableNegotiationLog: true, authAdapter }, mockPersistence);

      const ws = createMockWs();
      server.handleConnection(ws, "doc-1");
      const payload = await buildHandshakePayload();

      await server.handleMessage(
        ws,
        serializeMessage(createMessage("handshake", "doc-1", "client-1", payload))
      );

      sentMessages = [];

      const updateMsg = createMessage("doc_update", "doc-1", "client-1", {
        updateData: "AQID",
        isBase64: true,
        frontierTag: "v2",
        parentFrontierTag: "v1",
        sizeBytes: 3,
      });

      await server.handleMessage(ws, serializeMessage(updateMsg));

      expect(sentMessages.length).toBe(1);
      const response = parseClientMessage(sentMessages[0]);
      expect(response.type).toBe("doc_ack");
      expect(response.payload.applied).toBe(false);
      expect(response.payload.rejectionReason).toBe("Unauthorized");
    });
  });

  describe("handleMessage - ping", () => {
    it("should respond with pong", async () => {
      const ws = createMockWs();
      server.handleConnection(ws, "doc-1");
      const msg = createMessage("ping", "doc-1", "client-1", {});

      await server.handleMessage(ws, serializeMessage(msg));

      expect(sentMessages.length).toBe(1);
      const response = parseClientMessage(sentMessages[0]);
      expect(response.type).toBe("pong");
      expect(response.payload).toEqual({});
    });
  });

  describe("handleMessage - catch up request", () => {
    it("should send snapshot when preferSnapshot is true", async () => {
      const ws = createMockWs();
      server.handleConnection(ws, "doc-1");
      const payload = await buildHandshakePayload();
      await server.handleMessage(
        ws,
        serializeMessage(createMessage("handshake", "doc-1", "client-1", payload))
      );
      sentMessages = [];

      const reqMsg = createMessage("catch_up_request", "doc-1", "client-1", {
        fromFrontierTag: "v0",
        preferSnapshot: true,
      });
      await server.handleMessage(ws, serializeMessage(reqMsg));

      expect(sentMessages.length).toBe(1);
      const response = parseClientMessage(sentMessages[0]);
      expect(response.type).toBe("catch_up_response");
      const responsePayload = response.payload as CatchUpResponsePayload;
      expect(responsePayload.isSnapshot).toBe(true);
    });

    it("should send incremental updates when preferSnapshot is false", async () => {
      const ws = createMockWs();
      server.handleConnection(ws, "doc-1");
      const payload = await buildHandshakePayload();
      await server.handleMessage(
        ws,
        serializeMessage(createMessage("handshake", "doc-1", "client-1", payload))
      );
      sentMessages = [];

      const reqMsg = createMessage("catch_up_request", "doc-1", "client-1", {
        fromFrontierTag: "v0",
        preferSnapshot: false,
      });
      await server.handleMessage(ws, serializeMessage(reqMsg));

      expect(sentMessages.length).toBe(1);
      const response = parseClientMessage(sentMessages[0]);
      expect(response.type).toBe("catch_up_response");
      const responsePayload = response.payload as CatchUpResponsePayload;
      expect(responsePayload.data).toBeDefined();
      expect(responsePayload.frontierTag).toBeDefined();
    });
  });

  describe("handleMessage - doc updates", () => {
    it("should broadcast updates to other clients", async () => {
      const ws1 = createMockWs();
      const ws2 = createMockWs();
      server.handleConnection(ws1, "doc-1");
      server.handleConnection(ws2, "doc-1");

      const payload = await buildHandshakePayload();
      await server.handleMessage(
        ws1,
        serializeMessage(createMessage("handshake", "doc-1", "client-1", payload))
      );
      await server.handleMessage(
        ws2,
        serializeMessage(createMessage("handshake", "doc-1", "client-2", payload))
      );
      sentMessages = [];

      const updateMsg = createMessage("doc_update", "doc-1", "client-1", {
        updateData: "aGVsbG8=",
        isBase64: true,
        frontierTag: "v2",
        parentFrontierTag: "v1",
        sizeBytes: 5,
      });

      await server.handleMessage(ws1, serializeMessage(updateMsg));

      expect(sentMessages.length).toBe(2);
      const ackMsg = parseClientMessage(sentMessages[0]);
      expect(ackMsg.type).toBe("doc_ack");
      const broadcastMsg = parseClientMessage(sentMessages[1]);
      expect(broadcastMsg.type).toBe("doc_update");
    });
  });

  describe("idle cleanup", () => {
    it("should close idle clients", async () => {
      vi.useFakeTimers();
      const ws = createMockWs();
      server = new SyncServer({ idleTimeoutMs: 1000, idleCheckIntervalMs: 500 }, mockPersistence);
      server.handleConnection(ws, "doc-1");
      const payload = await buildHandshakePayload();

      await server.handleMessage(
        ws,
        serializeMessage(createMessage("handshake", "doc-1", "client-1", payload))
      );

      vi.advanceTimersByTime(2000);
      expect(ws.closeEvents.length).toBeGreaterThan(0);
      vi.useRealTimers();
    });
  });

  describe("disconnect handling", () => {
    it("should remove client from room on disconnect", async () => {
      const ws = createMockWs();
      server.handleConnection(ws, "doc-1");
      const payload = await buildHandshakePayload();

      await server.handleMessage(
        ws,
        serializeMessage(createMessage("handshake", "doc-1", "client-1", payload))
      );

      server.handleDisconnect("client-1", "doc-1");
      const room = server.getRoom("doc-1");
      expect(room).toBeUndefined();
    });
  });

  describe("handshake timeouts", () => {
    it("should close connections that never handshake", () => {
      const timeoutServer = new SyncServer({ handshakeTimeoutMs: 1000 }, mockPersistence);
      const ws = createMockWs();

      vi.useFakeTimers();
      vi.setSystemTime(new Date(0));

      timeoutServer.handleConnection(ws, "doc-1");
      vi.advanceTimersByTime(1001);

      expect(ws.closeEvents.length).toBe(1);
      expect(timeoutServer.getPendingConnectionsCount()).toBe(0);

      timeoutServer.shutdown();
      vi.useRealTimers();
    });

    it("should reject handshakes after timeout", async () => {
      const timeoutServer = new SyncServer({ handshakeTimeoutMs: 1000 }, mockPersistence);
      const ws = createMockWs();

      vi.useFakeTimers();
      vi.setSystemTime(new Date(0));

      timeoutServer.handleConnection(ws, "doc-1");
      vi.advanceTimersByTime(1001);

      const payload = await buildHandshakePayload();
      await timeoutServer.handleMessage(
        ws,
        serializeMessage(createMessage("handshake", "doc-1", "client-1", payload))
      );

      expect(sentMessages.length).toBeGreaterThan(0);
      const response = parseClientMessage(sentMessages[0]);
      expect(response.type).toBe("error");

      timeoutServer.shutdown();
      vi.useRealTimers();
    });
  });
});
