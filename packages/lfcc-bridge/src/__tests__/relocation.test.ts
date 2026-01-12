import { DEFAULT_POLICY_MANIFEST } from "@keepup/core";
import { beforeEach, describe, expect, it } from "vitest";
import { type RelocationSecurity, createRelocationSecurity } from "../security/relocation";

describe("RelocationSecurity", () => {
  let relocationSecurity: RelocationSecurity;

  beforeEach(() => {
    relocationSecurity = createRelocationSecurity(DEFAULT_POLICY_MANIFEST.relocation_policy);
  });

  describe("Level 1 (Exact Match Only)", () => {
    it("should reject Level 1 relocation", () => {
      const original = { blockId: "b1", start: 0, end: 5 };
      const relocated = { blockId: "b1", start: 1, end: 6 };
      const result = relocationSecurity.validateRelocation(original, relocated, 1, 100);
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("RELOCATION_NOT_ALLOWED");
    });
  });

  describe("Level 2 (Distance Limit)", () => {
    it("should reject Level 2 if disabled", () => {
      const original = { blockId: "b1", start: 0, end: 5 };
      const relocated = { blockId: "b1", start: 1, end: 6 };
      const result = relocationSecurity.validateRelocation(original, relocated, 2, 100);
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("LEVEL_2_DISABLED");
    });

    it("should accept Level 2 if enabled and within distance", () => {
      const policy = {
        ...DEFAULT_POLICY_MANIFEST.relocation_policy,
        enable_level_2: true,
        level_2_max_distance_ratio: 0.1, // 10%
      };
      const security = createRelocationSecurity(policy);

      const original = { blockId: "b1", start: 0, end: 5 };
      const relocated = { blockId: "b1", start: 5, end: 10 }; // 5 units away, 10% of 100
      const result = security.validateRelocation(original, relocated, 2, 100);
      expect(result.ok).toBe(true);
      expect(result.requiresConfirmation).toBe(true);
    });

    it("should reject Level 2 if distance exceeds limit", () => {
      const policy = {
        ...DEFAULT_POLICY_MANIFEST.relocation_policy,
        enable_level_2: true,
        level_2_max_distance_ratio: 0.1, // 10%
      };
      const security = createRelocationSecurity(policy);

      const original = { blockId: "b1", start: 0, end: 5 };
      const relocated = { blockId: "b1", start: 20, end: 25 }; // 20 units away, >10% of 100
      const result = security.validateRelocation(original, relocated, 2, 100);
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("RELOCATION_DISTANCE_EXCEEDED");
    });
  });

  describe("Level 3 (Block Radius)", () => {
    it("should reject Level 3 if disabled", () => {
      const original = { blockId: "b1", start: 0, end: 5 };
      const relocated = { blockId: "b2", start: 0, end: 5 };
      const result = relocationSecurity.validateRelocation(original, relocated, 3, 100);
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("LEVEL_3_DISABLED");
    });

    // P0.3: Test block radius enforcement
    it("should require block order for Level 3", () => {
      const policy = {
        ...DEFAULT_POLICY_MANIFEST.relocation_policy,
        enable_level_3: true,
        level_3_max_block_radius: 2,
      };
      const security = createRelocationSecurity(policy);

      const original = { blockId: "b1", start: 0, end: 5 };
      const relocated = { blockId: "b2", start: 0, end: 5 };

      // Without block order, should fail
      const result = security.validateRelocation(original, relocated, 3, 100);
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("BLOCK_ORDER_REQUIRED");
    });

    it("should accept small cross-block move within radius (P0.3)", () => {
      const policy = {
        ...DEFAULT_POLICY_MANIFEST.relocation_policy,
        enable_level_3: true,
        level_3_max_block_radius: 2,
      };
      const security = createRelocationSecurity(policy);

      const original = { blockId: "b1", start: 0, end: 5 };
      const relocated = { blockId: "b2", start: 0, end: 5 };

      // Block order: b1 at position 0, b2 at position 1 (radius = 1)
      const blockOrder = new Map<string, number>([
        ["b1", 0],
        ["b2", 1],
      ]);

      const result = security.validateRelocation(original, relocated, 3, 100, {
        blockOrder,
      });
      expect(result.ok).toBe(true);
      expect(result.blockRadius).toBe(1);
      expect(result.requiresConfirmation).toBe(true);
    });

    it("should reject large cross-block move exceeding radius (P0.3)", () => {
      const policy = {
        ...DEFAULT_POLICY_MANIFEST.relocation_policy,
        enable_level_3: true,
        level_3_max_block_radius: 2,
      };
      const security = createRelocationSecurity(policy);

      const original = { blockId: "b1", start: 0, end: 5 };
      const relocated = { blockId: "b5", start: 0, end: 5 };

      // Block order: b1 at position 0, b5 at position 4 (radius = 4 > 2)
      const blockOrder = new Map<string, number>([
        ["b1", 0],
        ["b2", 1],
        ["b3", 2],
        ["b4", 3],
        ["b5", 4],
      ]);

      const result = security.validateRelocation(original, relocated, 3, 100, {
        blockOrder,
      });
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("RELOCATION_BLOCK_RADIUS_EXCEEDED");
      expect(result.blockRadius).toBe(4);
    });
  });

  describe("User Confirmation", () => {
    it("should require user confirmation for Level 2", () => {
      const policy = {
        ...DEFAULT_POLICY_MANIFEST.relocation_policy,
        enable_level_2: true,
      };
      const security = createRelocationSecurity(policy);

      const original = { blockId: "b1", start: 0, end: 5 };
      const relocated = { blockId: "b1", start: 1, end: 6 };
      const result = security.validateRelocation(original, relocated, 2, 100);

      if (result.ok) {
        expect(result.requiresConfirmation).toBe(true);
        // Without confirmation, should fail
        const hasConfirmation = security.hasUserConfirmation("anno1", original, relocated, 2);
        expect(hasConfirmation).toBe(false);
      }
    });

    it("should accept relocation with user confirmation", () => {
      const policy = {
        ...DEFAULT_POLICY_MANIFEST.relocation_policy,
        enable_level_2: true,
      };
      const security = createRelocationSecurity(policy);

      const original = { blockId: "b1", start: 0, end: 5 };
      const relocated = { blockId: "b1", start: 1, end: 6 };

      // Record confirmation
      security.recordUserConfirmation("anno1", original, relocated, 2);

      // Now should have confirmation
      const hasConfirmation = security.hasUserConfirmation("anno1", original, relocated, 2);
      expect(hasConfirmation).toBe(true);
    });
  });
});
