/**
 * LFCC v0.9 RC - Sync Client Tests
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { computePolicyManifestHash } from "../../kernel/policy";
import { SyncClient, type SyncClientConfig } from "../client";
import { createDefaultSyncManifest, negotiateManifests } from "../negotiate";
import { type HandshakeAckPayload, createMessage, serializeMessage } from "../protocol";

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;

  sentMessages: string[] = [];

  constructor(public url: string) {
    // Simulate async connection
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.();
    }, 10);
  }

  send(data: string): void {
    this.sentMessages.push(data);
  }

  close(code?: number, reason?: string): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code: code ?? 1000, reason: reason ?? "" });
  }

  // Test helper to simulate receiving a message
  simulateMessage(data: string): void {
    this.onmessage?.({ data });
  }
}

// Replace global WebSocket
(globalThis as unknown as { WebSocket: typeof MockWebSocket }).WebSocket = MockWebSocket;

describe("Sync Client", () => {
  let config: SyncClientConfig;
  let _mockWs: MockWebSocket;
  const manifest = createDefaultSyncManifest();
  const policyHash = "test-manifest-hash";
  const hashSpy = vi.spyOn({ computePolicyManifestHash }, "computePolicyManifestHash");

  async function buildHandshakeAckPayload(): Promise<HandshakeAckPayload> {
    const negotiation = negotiateManifests(manifest, manifest);
    if (!negotiation.success || !negotiation.effectiveManifest) {
      throw new Error("Negotiation failed in test setup");
    }

    const manifestHash = await computePolicyManifestHash(negotiation.effectiveManifest);
    return {
      server_manifest_v09: manifest,
      chosen_manifest_hash: manifestHash,
      effective_manifest_v09: negotiation.effectiveManifest,
      sessionId: "session-123",
      needsCatchUp: false,
      serverFrontierTag: "v1",
      serverCapabilities: {
        maxClientsPerRoom: 50,
        presenceTtlMs: 30000,
        supportsSnapshots: true,
      },
    };
  }

  beforeEach(() => {
    hashSpy.mockResolvedValue(policyHash);
    config = {
      url: "ws://localhost:8080",
      docId: "doc-1",
      clientId: "client-1",
      policyManifest: manifest,
      userMeta: { userId: "u1", displayName: "User 1" },
    };
  });

  describe("constructor", () => {
    it("should create client with config", () => {
      const client = new SyncClient(config);
      expect(client.getState()).toBe("disconnected");
      expect(client.getSessionId()).toBeNull();
    });

    it("should generate clientId if not provided", () => {
      const client = new SyncClient({ url: "ws://localhost", docId: "doc-1" });
      expect(client.getState()).toBe("disconnected");
    });
  });

  describe("connect", () => {
    it("should transition to connecting state", async () => {
      const client = new SyncClient(config);
      const states: string[] = [];

      client.on("stateChange", (state) => states.push(state));

      const connectPromise = client.connect();

      // Wait for WebSocket to "connect"
      await new Promise((resolve) => setTimeout(resolve, 20));

      // Simulate handshake ack
      const ws = (client as unknown as { ws: MockWebSocket }).ws;
      const ackPayload = await buildHandshakeAckPayload();
      ws.simulateMessage(
        serializeMessage(createMessage("handshake_ack", "doc-1", "server", ackPayload))
      );

      await connectPromise;

      expect(states).toContain("connecting");
      expect(states).toContain("handshaking");
      expect(states).toContain("connected");
      expect(client.getState()).toBe("connected");
      expect(client.getSessionId()).toBe("session-123");

      client.disconnect();
    });

    it("ignores invalid messages without changing state", async () => {
      const client = new SyncClient(config);
      const connectPromise = client.connect();

      await new Promise((resolve) => setTimeout(resolve, 20));

      const ws = (client as unknown as { ws: MockWebSocket }).ws;
      const ackPayload = await buildHandshakeAckPayload();
      ws.simulateMessage(
        serializeMessage(createMessage("handshake_ack", "doc-1", "server", ackPayload))
      );

      await connectPromise;

      const initialState = client.getState();
      ws.simulateMessage("not-json");
      ws.simulateMessage(JSON.stringify({ type: "doc_update" }));

      expect(client.getState()).toBe(initialState);

      client.disconnect();
    });
  });

  describe("sendUpdate", () => {
    it("should throw if not connected", () => {
      const client = new SyncClient(config);
      expect(() => client.sendUpdate(new Uint8Array([1, 2, 3]), "v2", "v1")).toThrow();
    });
  });

  describe("sendPresence", () => {
    it("should not throw if not connected", () => {
      const client = new SyncClient(config);
      // Should not throw, just silently ignore
      expect(() => client.sendPresence({ blockId: "b1", offset: 0 })).not.toThrow();
    });
  });

  describe("event handling", () => {
    it("should add and remove listeners", () => {
      const client = new SyncClient(config);
      const listener = vi.fn();

      client.on("stateChange", listener);
      client.off("stateChange", listener);

      // Trigger state change internally - this won't call listener since it's removed
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("setLastFrontierTag", () => {
    it("should set frontier tag for reconnect", () => {
      const client = new SyncClient(config);
      client.setLastFrontierTag("v5");
      expect(client.getLastFrontierTag()).toBe("v5");
    });
  });
});
