/**
 * LFCC v0.9 RC - Sync Protocol Tests
 */

import { beforeEach, describe, expect, it } from "vitest";
import { computePolicyManifestHash } from "../../kernel/policy/index.js";
import { createDefaultSyncManifest } from "../negotiate.js";
import {
  type DocUpdatePayload,
  type HandshakePayload,
  PROTOCOL_VERSION,
  type PresencePayload,
  createMessage,
  deserializeMessage,
  resetSeqCounter,
  serializeMessage,
  validateMessage,
} from "../protocol.js";

describe("Sync Protocol", () => {
  const manifest = createDefaultSyncManifest();
  const manifestHashPromise = computePolicyManifestHash(manifest);

  beforeEach(() => {
    resetSeqCounter();
  });

  describe("createMessage", () => {
    it("should create message with correct structure", async () => {
      const payload: HandshakePayload = {
        client_manifest_v09: manifest,
        client_manifest_hash: await manifestHashPromise,
        capabilities: {
          features: [],
          maxUpdateSize: 1000000,
          supportsBinary: true,
          supportsCompression: false,
        },
      };

      const msg = createMessage("handshake", "doc-1", "client-1", payload);

      expect(msg.version).toBe(PROTOCOL_VERSION);
      expect(msg.type).toBe("handshake");
      expect(msg.docId).toBe("doc-1");
      expect(msg.clientId).toBe("client-1");
      expect(msg.seq).toBe(1);
      expect(msg.timestamp).toBeDefined();
      expect(msg.payload).toEqual(payload);
    });

    it("should increment sequence number", () => {
      const msg1 = createMessage("ping", "doc-1", "client-1", {});
      const msg2 = createMessage("ping", "doc-1", "client-1", {});
      const msg3 = createMessage("ping", "doc-1", "client-1", {});

      expect(msg1.seq).toBe(1);
      expect(msg2.seq).toBe(2);
      expect(msg3.seq).toBe(3);
    });
  });

  describe("serializeMessage / deserializeMessage", () => {
    it("should round-trip message", () => {
      const payload: DocUpdatePayload = {
        updateData: "SGVsbG8=",
        isBase64: true,
        frontierTag: "v1",
        parentFrontierTag: "v0",
        sizeBytes: 5,
      };

      const msg = createMessage("doc_update", "doc-1", "client-1", payload);
      const json = serializeMessage(msg);
      const restored = deserializeMessage(json);

      expect(validateMessage(restored)).toBe(true);
      if (validateMessage(restored)) {
        expect(restored).toEqual(msg);
      }
    });
  });

  describe("validateMessage", () => {
    it("should validate correct message", () => {
      const msg = createMessage("ping", "doc-1", "client-1", {});
      expect(validateMessage(msg)).toBe(true);
    });

    it("should reject invalid message", () => {
      expect(validateMessage(null)).toBe(false);
      expect(validateMessage({})).toBe(false);
      expect(validateMessage({ type: "ping" })).toBe(false);
      expect(validateMessage({ version: "1.0", type: "ping", docId: "d" })).toBe(false);
    });
  });

  describe("Message Types", () => {
    it("should create handshake message", async () => {
      const payload: HandshakePayload = {
        client_manifest_v09: manifest,
        client_manifest_hash: await manifestHashPromise,
        capabilities: {
          features: [],
          maxUpdateSize: 1000000,
          supportsBinary: true,
          supportsCompression: false,
        },
        lastFrontierTag: "v0",
        userMeta: { userId: "u1", displayName: "User 1" },
      };

      const msg = createMessage("handshake", "doc-1", "client-1", payload);
      expect(msg.type).toBe("handshake");
      expect(msg.payload.lastFrontierTag).toBe("v0");
    });

    it("should create presence message", () => {
      const payload: PresencePayload = {
        userMeta: { userId: "u1", displayName: "User 1", color: "#ff0000" },
        cursor: { blockId: "block-1", offset: 5 },
        selection: {
          anchor: { blockId: "block-1", offset: 0 },
          head: { blockId: "block-1", offset: 10 },
        },
        status: "active",
        lastActivity: new Date().toISOString(),
      };

      const msg = createMessage("presence", "doc-1", "client-1", payload);
      expect(msg.type).toBe("presence");
      expect(msg.payload.cursor?.blockId).toBe("block-1");
    });

    it("should create error message", () => {
      const msg = createMessage("error", "doc-1", "server", {
        code: "POLICY_MISMATCH",
        category: "policy",
        message: "Policy negotiation failed",
        retryable: false,
      });

      expect(msg.type).toBe("error");
      expect(msg.payload.code).toBe("POLICY_MISMATCH");
    });
  });
});
