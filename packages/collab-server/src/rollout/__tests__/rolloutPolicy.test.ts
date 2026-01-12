/**
 * Rollout Policy Engine Tests
 */

import { describe, expect, it } from "vitest";
import { type RolloutPolicyConfig, RolloutPolicyEngine } from "../rolloutPolicy";

describe("RolloutPolicyEngine", () => {
  describe("kill switch", () => {
    it("disables collab when kill switch is active", () => {
      const engine = new RolloutPolicyEngine({ killSwitch: true });
      const result = engine.evaluate({
        docId: "doc-1",
        environment: "dev",
        userId: "user-1",
      });
      expect(result.collabEnabled).toBe(false);
      expect(result.reason).toBe("kill_switch_active");
    });

    it("can activate and deactivate kill switch at runtime", () => {
      const engine = new RolloutPolicyEngine({
        environmentDefaults: { dev: true, staging: true, prod: true },
      });

      let result = engine.evaluate({ docId: "doc-1", environment: "dev" });
      expect(result.collabEnabled).toBe(true);

      engine.activateKillSwitch();
      result = engine.evaluate({ docId: "doc-1", environment: "dev" });
      expect(result.collabEnabled).toBe(false);

      engine.deactivateKillSwitch();
      result = engine.evaluate({ docId: "doc-1", environment: "dev" });
      expect(result.collabEnabled).toBe(true);
    });
  });

  describe("user denylist", () => {
    it("denies collab for denylisted users", () => {
      const engine = new RolloutPolicyEngine({
        userDenylist: ["bad-user"],
        userAllowlist: ["bad-user"], // Denylist takes precedence
      });
      const result = engine.evaluate({
        docId: "doc-1",
        environment: "dev",
        userId: "bad-user",
      });
      expect(result.collabEnabled).toBe(false);
      expect(result.reason).toBe("user_denylisted");
    });
  });

  describe("doc denylist", () => {
    it("denies collab for denylisted docs", () => {
      const engine = new RolloutPolicyEngine({
        docDenylist: ["sensitive-doc"],
        docAllowlist: ["sensitive-doc"], // Denylist takes precedence
      });
      const result = engine.evaluate({
        docId: "sensitive-doc",
        environment: "dev",
      });
      expect(result.collabEnabled).toBe(false);
      expect(result.reason).toBe("doc_denylisted");
    });
  });

  describe("user allowlist", () => {
    it("enables collab for allowlisted users", () => {
      const engine = new RolloutPolicyEngine({
        userAllowlist: ["vip-user"],
        environmentDefaults: { dev: false, staging: false, prod: false },
      });
      const result = engine.evaluate({
        docId: "doc-1",
        environment: "prod",
        userId: "vip-user",
      });
      expect(result.collabEnabled).toBe(true);
      expect(result.reason).toBe("user_allowlisted");
    });
  });

  describe("doc allowlist", () => {
    it("enables collab for allowlisted docs", () => {
      const engine = new RolloutPolicyEngine({
        docAllowlist: ["beta-doc"],
        environmentDefaults: { dev: false, staging: false, prod: false },
      });
      const result = engine.evaluate({
        docId: "beta-doc",
        environment: "prod",
      });
      expect(result.collabEnabled).toBe(true);
      expect(result.reason).toBe("doc_allowlisted");
    });
  });

  describe("team allowlist", () => {
    it("enables collab for users in allowlisted teams", () => {
      const engine = new RolloutPolicyEngine({
        teamAllowlist: ["beta-team"],
        environmentDefaults: { dev: false, staging: false, prod: false },
      });
      const result = engine.evaluate({
        docId: "doc-1",
        environment: "prod",
        userId: "user-1",
        teamId: "beta-team",
      });
      expect(result.collabEnabled).toBe(true);
      expect(result.reason).toBe("team_allowlisted");
    });
  });

  describe("percentage rollout", () => {
    it("enables collab for users in rollout percentage", () => {
      const engine = new RolloutPolicyEngine({
        rolloutPercentage: 100, // Everyone
        environmentDefaults: { dev: false, staging: false, prod: false },
      });
      const result = engine.evaluate({
        docId: "doc-1",
        environment: "prod",
        userId: "any-user",
      });
      expect(result.collabEnabled).toBe(true);
      expect(result.reason).toMatch(/percentage_rollout_bucket_/);
    });

    it("deterministically buckets users", () => {
      const engine = new RolloutPolicyEngine({
        rolloutPercentage: 50,
        environmentDefaults: { dev: false, staging: false, prod: false },
      });

      // Same user should always get same result
      const results = [];
      for (let i = 0; i < 5; i++) {
        const result = engine.evaluate({
          docId: "doc-1",
          environment: "prod",
          userId: "stable-user-id",
        });
        results.push(result.collabEnabled);
      }
      expect(new Set(results).size).toBe(1); // All same
    });
  });

  describe("environment defaults", () => {
    it("uses environment defaults when no other rules match", () => {
      const engine = new RolloutPolicyEngine({
        environmentDefaults: {
          dev: true,
          staging: true,
          prod: false,
        },
      });

      expect(engine.evaluate({ docId: "doc-1", environment: "dev" }).collabEnabled).toBe(true);
      expect(engine.evaluate({ docId: "doc-1", environment: "staging" }).collabEnabled).toBe(true);
      expect(engine.evaluate({ docId: "doc-1", environment: "prod" }).collabEnabled).toBe(false);
    });
  });

  describe("version gating", () => {
    it("denies old client versions", () => {
      const engine = new RolloutPolicyEngine({
        minClientVersion: "2.0.0",
        environmentDefaults: { dev: true, staging: true, prod: true },
      });

      const result = engine.evaluate({
        docId: "doc-1",
        environment: "dev",
        clientVersion: "1.5.0",
      });
      expect(result.collabEnabled).toBe(false);
      expect(result.reason).toBe("client_version_too_old");
    });

    it("allows clients meeting version requirement", () => {
      const engine = new RolloutPolicyEngine({
        minClientVersion: "2.0.0",
        environmentDefaults: { dev: true, staging: true, prod: true },
      });

      const result = engine.evaluate({
        docId: "doc-1",
        environment: "dev",
        clientVersion: "2.1.0",
      });
      expect(result.collabEnabled).toBe(true);
    });
  });

  describe("priority order", () => {
    it("kill switch overrides all", () => {
      const config: RolloutPolicyConfig = {
        version: 1,
        killSwitch: true,
        userAllowlist: ["user-1"],
        docAllowlist: ["doc-1"],
      };
      const engine = new RolloutPolicyEngine(config);
      const result = engine.evaluate({
        docId: "doc-1",
        environment: "dev",
        userId: "user-1",
      });
      expect(result.collabEnabled).toBe(false);
    });

    it("denylist overrides allowlist", () => {
      const engine = new RolloutPolicyEngine({
        userAllowlist: ["user-1"],
        userDenylist: ["user-1"],
      });
      const result = engine.evaluate({
        docId: "doc-1",
        environment: "dev",
        userId: "user-1",
      });
      expect(result.collabEnabled).toBe(false);
    });
  });

  describe("policy version", () => {
    it("tracks policy version", () => {
      const engine = new RolloutPolicyEngine({ version: 5 });
      const result = engine.evaluate({ docId: "doc-1", environment: "dev" });
      expect(result.policyVersion).toBe(5);
    });

    it("increments version on config update", () => {
      const engine = new RolloutPolicyEngine({ version: 1 });
      engine.updateConfig({ rolloutPercentage: 50 });
      const result = engine.evaluate({ docId: "doc-1", environment: "dev" });
      expect(result.policyVersion).toBe(2);
    });
  });
});
