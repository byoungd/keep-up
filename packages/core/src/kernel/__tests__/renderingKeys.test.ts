/**
 * LFCC v0.9 RC - Rendering Keys Determinism Tests
 * @see docs/product/Audit/phase6/TASK_PROMPT_LFCC_CONFORMANCE_BASELINE.md D6
 */

import { afterEach, describe, expect, it } from "vitest";
import {
  compareRenderingKeys,
  createSimpleRenderingKeysProvider,
  getRenderingKeys,
  type RenderingKeysSnapshot,
  registerRenderingKeysProvider,
  unregisterRenderingKeysProvider,
} from "../devtools/renderingKeys.js";

describe("Rendering Keys (D6)", () => {
  afterEach(() => {
    unregisterRenderingKeysProvider();
  });

  describe("Provider Registration", () => {
    it("should return null when no provider registered", () => {
      expect(getRenderingKeys()).toBeNull();
    });

    it("should return snapshot when provider registered", () => {
      const provider = () => ({
        keys: [{ blockId: "b1", virtualKey: "b1" }],
        timestamp: Date.now(),
        virtualizationEnabled: false,
      });

      registerRenderingKeysProvider(provider);
      const snapshot = getRenderingKeys();

      expect(snapshot).not.toBeNull();
      expect(snapshot?.keys).toHaveLength(1);
      expect(snapshot?.keys[0].blockId).toBe("b1");
    });

    it("should return null after unregistering", () => {
      const provider = () => ({
        keys: [],
        timestamp: Date.now(),
        virtualizationEnabled: false,
      });

      registerRenderingKeysProvider(provider);
      unregisterRenderingKeysProvider();

      expect(getRenderingKeys()).toBeNull();
    });
  });

  describe("Keys Comparison", () => {
    it("should detect identical keys", () => {
      const a: RenderingKeysSnapshot = {
        keys: [
          { blockId: "b1", virtualKey: "b1" },
          { blockId: "b2", virtualKey: "b2" },
        ],
        timestamp: 1,
        virtualizationEnabled: false,
      };
      const b: RenderingKeysSnapshot = {
        keys: [
          { blockId: "b1", virtualKey: "b1" },
          { blockId: "b2", virtualKey: "b2" },
        ],
        timestamp: 2, // Different timestamp, should be ignored
        virtualizationEnabled: false,
      };

      expect(compareRenderingKeys(a, b)).toBe(true);
    });

    it("should detect different keys", () => {
      const a: RenderingKeysSnapshot = {
        keys: [{ blockId: "b1", virtualKey: "b1" }],
        timestamp: 1,
        virtualizationEnabled: false,
      };
      const b: RenderingKeysSnapshot = {
        keys: [{ blockId: "b2", virtualKey: "b2" }],
        timestamp: 1,
        virtualizationEnabled: false,
      };

      expect(compareRenderingKeys(a, b)).toBe(false);
    });

    it("should detect different lengths", () => {
      const a: RenderingKeysSnapshot = {
        keys: [{ blockId: "b1", virtualKey: "b1" }],
        timestamp: 1,
        virtualizationEnabled: false,
      };
      const b: RenderingKeysSnapshot = {
        keys: [
          { blockId: "b1", virtualKey: "b1" },
          { blockId: "b2", virtualKey: "b2" },
        ],
        timestamp: 1,
        virtualizationEnabled: false,
      };

      expect(compareRenderingKeys(a, b)).toBe(false);
    });
  });

  describe("Simple Provider", () => {
    it("should create provider from block IDs", () => {
      const getBlockIds = () => ["block1", "block2", "block3"];
      const provider = createSimpleRenderingKeysProvider(getBlockIds);

      const snapshot = provider();

      expect(snapshot.keys).toHaveLength(3);
      expect(snapshot.keys[0].blockId).toBe("block1");
      expect(snapshot.keys[1].blockId).toBe("block2");
      expect(snapshot.keys[2].blockId).toBe("block3");
      expect(snapshot.virtualizationEnabled).toBe(false);
    });

    it("should track virtualization status", () => {
      const provider = createSimpleRenderingKeysProvider(() => [], true);
      const snapshot = provider();

      expect(snapshot.virtualizationEnabled).toBe(true);
    });
  });

  describe("Determinism Verification", () => {
    it("should produce stable keys across multiple calls", () => {
      const blockIds = ["a", "b", "c"];
      const provider = createSimpleRenderingKeysProvider(() => blockIds);
      registerRenderingKeysProvider(provider);

      const snapshot1 = getRenderingKeys();
      const snapshot2 = getRenderingKeys();

      expect(snapshot1).not.toBeNull();
      expect(snapshot2).not.toBeNull();
      if (!snapshot1 || !snapshot2) {
        throw new Error("Expected rendering keys snapshot");
      }
      expect(compareRenderingKeys(snapshot1, snapshot2)).toBe(true);
    });

    it("should detect non-deterministic key changes", () => {
      let callCount = 0;
      const nonDeterministicProvider = () => {
        callCount++;
        return {
          keys: [{ blockId: `b${callCount}`, virtualKey: `b${callCount}` }],
          timestamp: Date.now(),
          virtualizationEnabled: false,
        };
      };

      registerRenderingKeysProvider(nonDeterministicProvider);

      const snapshot1 = getRenderingKeys();
      const snapshot2 = getRenderingKeys();

      expect(snapshot1).not.toBeNull();
      expect(snapshot2).not.toBeNull();
      if (!snapshot1 || !snapshot2) {
        throw new Error("Expected rendering keys snapshot");
      }
      expect(compareRenderingKeys(snapshot1, snapshot2)).toBe(false);
    });
  });
});
