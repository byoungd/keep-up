/**
 * LFCC v0.9 RC - Sync Validation Tests
 */

import { describe, expect, it } from "vitest";
import { computePolicyManifestHash } from "../../kernel/policy/index.js";
import { DEFAULT_VALIDATION_CONFIG } from "../../security/validation.js";
import { createDefaultSyncManifest } from "../negotiate.js";
import { createMessage } from "../protocol.js";
import { validateClientInboundMessage, validateServerInboundMessage } from "../validation.js";

const manifest = createDefaultSyncManifest();
const manifestHashPromise = computePolicyManifestHash(manifest);

const capabilities = {
  features: [],
  maxUpdateSize: 1024 * 1024,
  supportsBinary: true,
  supportsCompression: false,
};

const userMeta = { userId: "u1", displayName: "User 1" };

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("validateClientInboundMessage", () => {
  it("rejects missing fields in handshake_ack", async () => {
    const manifestHash = await manifestHashPromise;
    const msg = createMessage("handshake_ack", "doc-1", "server", {
      server_manifest_v09: manifest,
      chosen_manifest_hash: manifestHash,
      effective_manifest_v09: manifest,
      serverCapabilities: { maxClientsPerRoom: 5, presenceTtlMs: 30000, supportsSnapshots: true },
      sessionId: "s1",
      needsCatchUp: false,
      serverFrontierTag: "v1",
    });
    const bad = clone(msg);
    (bad as { payload: { sessionId?: string } }).payload.sessionId = undefined;

    const result = validateClientInboundMessage(bad);
    expect(result.ok).toBe(false);
  });

  it("rejects wrong field types in doc_ack", () => {
    const msg = createMessage("doc_ack", "doc-1", "server", {
      ackedSeq: 1,
      applied: true,
      serverFrontierTag: "v1",
    });
    const bad = clone(msg);
    (bad as { payload: { ackedSeq: number | string } }).payload.ackedSeq = "nope";

    const result = validateClientInboundMessage(bad);
    expect(result.ok).toBe(false);
  });

  it("rejects oversized doc_update payloads", () => {
    const msg = createMessage("doc_update", "doc-1", "server", {
      updateData: "a".repeat(DEFAULT_VALIDATION_CONFIG.maxUpdateSize + 1),
      isBase64: true,
      frontierTag: "v2",
      parentFrontierTag: "v1",
      sizeBytes: DEFAULT_VALIDATION_CONFIG.maxUpdateSize + 1,
    });

    const result = validateClientInboundMessage(msg);
    expect(result.ok).toBe(false);
  });

  it("rejects oversized presence payloads", () => {
    const oversizedPresence = {
      userMeta: {
        userId: "u1",
        displayName: "x".repeat(DEFAULT_VALIDATION_CONFIG.maxPresenceSize + 10),
      },
      status: "active",
      lastActivity: new Date(0).toISOString(),
    };
    const msg = createMessage("presence_ack", "doc-1", "server", {
      presences: [{ clientId: "client-1", presence: oversizedPresence }],
    });

    const result = validateClientInboundMessage(msg);
    expect(result.ok).toBe(false);
  });
});

describe("validateServerInboundMessage", () => {
  it("accepts valid handshake", async () => {
    const manifestHash = await manifestHashPromise;
    const msg = createMessage("handshake", "doc-1", "client-1", {
      client_manifest_v09: manifest,
      client_manifest_hash: manifestHash,
      capabilities,
      userMeta,
    });

    const result = validateServerInboundMessage(msg);
    expect(result.ok).toBe(true);
  });

  it("rejects malformed presence payload", () => {
    const msg = createMessage("presence", "doc-1", "client-1", {
      userMeta: { userId: "u1", displayName: "User 1" },
      status: "active",
    });

    const result = validateServerInboundMessage(msg);
    expect(result.ok).toBe(false);
  });

  it("rejects oversized updates", () => {
    const msg = createMessage("doc_update", "doc-1", "client-1", {
      updateData: "a".repeat(DEFAULT_VALIDATION_CONFIG.maxUpdateSize + 1),
      isBase64: true,
      frontierTag: "v2",
      parentFrontierTag: "v1",
      sizeBytes: DEFAULT_VALIDATION_CONFIG.maxUpdateSize + 1,
    });

    const result = validateServerInboundMessage(msg);
    expect(result.ok).toBe(false);
  });

  it("accepts doc_update payload with origin tag", () => {
    const msg = createMessage("doc_update", "doc-1", "client-1", {
      updateData: "AQID",
      isBase64: true,
      frontierTag: "v2",
      parentFrontierTag: "v1",
      sizeBytes: 3,
      origin: "lfcc:ai:e2e",
    });

    const result = validateServerInboundMessage(msg);
    expect(result.ok).toBe(true);
  });
});

describe("sync validator fuzz", () => {
  it("does not throw on random payloads", () => {
    const rng = createRng(1337);
    for (let i = 0; i < 50; i++) {
      const value = randomValue(rng, 0);
      expect(() => validateClientInboundMessage(value)).not.toThrow();
      expect(() => validateServerInboundMessage(value)).not.toThrow();
    }
  });
});

function createRng(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 48271) % 2147483647;
    return state / 2147483647;
  };
}

function randomValue(rng: () => number, depth: number): unknown {
  if (depth > 3) {
    return rng() > 0.5 ? "text" : 42;
  }
  const roll = rng();
  if (roll < 0.2) {
    return null;
  }
  if (roll < 0.4) {
    return rng() > 0.5;
  }
  if (roll < 0.6) {
    return Math.floor(rng() * 1000);
  }
  if (roll < 0.75) {
    return `str-${Math.floor(rng() * 100)}`;
  }
  if (roll < 0.9) {
    return Array.from({ length: Math.floor(rng() * 4) }, () => randomValue(rng, depth + 1));
  }
  const obj: Record<string, unknown> = {};
  const count = Math.floor(rng() * 4);
  for (let i = 0; i < count; i++) {
    obj[`k${i}`] = randomValue(rng, depth + 1);
  }
  return obj;
}
