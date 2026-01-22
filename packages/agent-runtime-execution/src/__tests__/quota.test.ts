/**
 * Quota Manager Tests
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createQuotaManager,
  createTieredQuotaManager,
  QUOTA_PRESETS,
  type QuotaManager,
  type QuotaScope,
} from "../quota";

describe("QuotaManager", () => {
  let manager: QuotaManager;

  beforeEach(() => {
    manager = createQuotaManager({ cleanupIntervalMs: 0 }); // Disable auto-cleanup for tests
  });

  afterEach(() => {
    manager.dispose();
  });

  describe("quota configuration", () => {
    it("should set and get quota config", () => {
      const scope: QuotaScope = { type: "user", id: "user-1" };

      manager.setQuota(scope, {
        limits: {
          tokens_total: { max: 1000, windowMs: 60000, action: "block" },
        },
      });

      const config = manager.getQuota(scope);
      expect(config).toBeDefined();
      expect(config?.limits.tokens_total?.max).toBe(1000);
    });

    it("should remove quota config", () => {
      const scope: QuotaScope = { type: "user", id: "user-1" };

      manager.setQuota(scope, {
        limits: {
          api_calls: { max: 100, windowMs: 3600000, action: "block" },
        },
      });

      const removed = manager.removeQuota(scope);
      expect(removed).toBe(true);
      expect(manager.getQuota(scope)).toBeUndefined();
    });

    it("should use default config when no specific config exists", () => {
      const managerWithDefaults = createQuotaManager({
        cleanupIntervalMs: 0,
        defaults: {
          user: {
            limits: {
              tokens_total: { max: 5000, windowMs: 60000, action: "warn" },
            },
          },
        },
      });

      const scope: QuotaScope = { type: "user", id: "any-user" };
      const config = managerWithDefaults.getQuota(scope);

      expect(config?.limits.tokens_total?.max).toBe(5000);
      managerWithDefaults.dispose();
    });
  });

  describe("usage recording", () => {
    it("should record resource usage", () => {
      const scope: QuotaScope = { type: "session", id: "session-1" };

      manager.setQuota(scope, {
        limits: {
          tokens_total: { max: 1000, windowMs: 60000, action: "block" },
        },
      });

      manager.record(scope, "tokens_total", 100);
      manager.record(scope, "tokens_total", 200);

      const usage = manager.getUsage(scope, "tokens_total");
      expect(usage).toBe(300);
    });

    it("should track usage with metadata", () => {
      const scope: QuotaScope = { type: "agent", id: "agent-1" };

      manager.setQuota(scope, {
        limits: {
          tool_calls: { max: 50, windowMs: 60000, action: "block" },
        },
      });

      manager.record(scope, "tool_calls", 1, { toolName: "bash" });
      manager.record(scope, "tool_calls", 1, { toolName: "file_read" });

      expect(manager.getUsage(scope, "tool_calls")).toBe(2);
    });
  });

  describe("quota checking", () => {
    it("should allow usage within limits", () => {
      const scope: QuotaScope = { type: "user", id: "user-1" };

      manager.setQuota(scope, {
        limits: {
          api_calls: { max: 100, windowMs: 60000, action: "block" },
        },
      });

      const result = manager.check(scope, "api_calls", 1);

      expect(result.allowed).toBe(true);
      expect(result.currentUsage).toBe(0);
    });

    it("should block usage exceeding limits", () => {
      const scope: QuotaScope = { type: "user", id: "user-1" };

      manager.setQuota(scope, {
        limits: {
          api_calls: { max: 5, windowMs: 60000, action: "block" },
        },
      });

      // Use up the quota
      for (let i = 0; i < 5; i++) {
        manager.record(scope, "api_calls", 1);
      }

      const result = manager.check(scope, "api_calls", 1);

      expect(result.allowed).toBe(false);
      expect(result.deniedBy).toBe("api_calls");
      expect(result.currentUsage).toBe(5);
      expect(result.limit).toBe(5);
    });

    it("should warn but allow when action is warn", () => {
      const scope: QuotaScope = { type: "user", id: "user-1" };

      manager.setQuota(scope, {
        limits: {
          tokens_total: { max: 100, windowMs: 60000, action: "warn" },
        },
      });

      manager.record(scope, "tokens_total", 100);

      const result = manager.check(scope, "tokens_total", 50);

      expect(result.allowed).toBe(true);
      expect(result.warning).toContain("Quota warning");
    });

    it("should throttle when action is throttle", () => {
      const scope: QuotaScope = { type: "user", id: "user-1" };

      manager.setQuota(scope, {
        limits: {
          api_calls: { max: 2, windowMs: 60000, action: "throttle" },
        },
      });

      manager.record(scope, "api_calls", 2);

      const result = manager.check(scope, "api_calls", 1);

      expect(result.allowed).toBe(false);
      expect(result.deniedBy).toBe("api_calls");
      expect(result.retryAfterMs).toBeDefined();
      expect(result.retryAfterMs).toBeLessThanOrEqual(1000); // Throttle uses short retry
    });

    it("should allow when no quota config exists", () => {
      const scope: QuotaScope = { type: "user", id: "unknown" };

      const result = manager.check(scope, "tokens_total", 1000000);

      expect(result.allowed).toBe(true);
    });

    it("should allow when resource not configured", () => {
      const scope: QuotaScope = { type: "user", id: "user-1" };

      manager.setQuota(scope, {
        limits: {
          api_calls: { max: 10, windowMs: 60000, action: "block" },
        },
      });

      // Check a resource that isn't configured
      const result = manager.check(scope, "tokens_total", 1000000);

      expect(result.allowed).toBe(true);
    });
  });

  describe("checkAndRecord", () => {
    it("should check and record in one operation", () => {
      const scope: QuotaScope = { type: "session", id: "session-1" };

      manager.setQuota(scope, {
        limits: {
          tool_calls: { max: 10, windowMs: 60000, action: "block" },
        },
      });

      const result1 = manager.checkAndRecord(scope, "tool_calls", 3);
      expect(result1.allowed).toBe(true);
      expect(manager.getUsage(scope, "tool_calls")).toBe(3);

      const result2 = manager.checkAndRecord(scope, "tool_calls", 5);
      expect(result2.allowed).toBe(true);
      expect(manager.getUsage(scope, "tool_calls")).toBe(8);

      // This would exceed
      const result3 = manager.checkAndRecord(scope, "tool_calls", 5);
      expect(result3.allowed).toBe(false);
      // Should not have recorded
      expect(manager.getUsage(scope, "tool_calls")).toBe(8);
    });
  });

  describe("usage summary", () => {
    it("should provide usage summary", () => {
      const scope: QuotaScope = { type: "user", id: "user-1" };

      manager.setQuota(scope, {
        limits: {
          tokens_total: { max: 1000, windowMs: 60000, action: "block" },
          api_calls: { max: 100, windowMs: 60000, action: "block" },
        },
      });

      manager.record(scope, "tokens_total", 500);
      manager.record(scope, "api_calls", 10);

      const summary = manager.getUsageSummary(scope);

      expect(summary.scope).toEqual(scope);
      expect(summary.resources).toHaveLength(2);

      const tokenResource = summary.resources.find((r) => r.type === "tokens_total");
      expect(tokenResource?.used).toBe(500);
      expect(tokenResource?.limit).toBe(1000);
      expect(tokenResource?.percentage).toBe(50);
    });

    it("should include warnings for high usage", () => {
      const scope: QuotaScope = { type: "user", id: "user-1" };

      manager.setQuota(scope, {
        limits: {
          tokens_total: { max: 100, windowMs: 60000, action: "block" },
        },
      });

      manager.record(scope, "tokens_total", 95);

      const summary = manager.getUsageSummary(scope);

      expect(summary.warnings).toHaveLength(1);
      expect(summary.warnings[0]).toContain("95");
    });
  });

  describe("cooldown", () => {
    it("should enforce cooldown after exceeding limit", () => {
      const scope: QuotaScope = { type: "user", id: "user-1" };

      manager.setQuota(scope, {
        limits: {
          api_calls: {
            max: 2,
            windowMs: 60000,
            action: "block",
            cooldownMs: 5000,
          },
        },
      });

      manager.record(scope, "api_calls", 2);

      // First check sets cooldown
      const result1 = manager.check(scope, "api_calls", 1);
      expect(result1.allowed).toBe(false);

      // Second check is still in cooldown
      const result2 = manager.check(scope, "api_calls", 1);
      expect(result2.allowed).toBe(false);
      expect(result2.retryAfterMs).toBeGreaterThan(0);
      expect(result2.retryAfterMs).toBeLessThanOrEqual(5000);
    });
  });

  describe("cleanup", () => {
    it("should clear usage for a scope", () => {
      const scope: QuotaScope = { type: "session", id: "session-1" };

      manager.setQuota(scope, {
        limits: {
          tokens_total: { max: 1000, windowMs: 60000, action: "block" },
        },
      });

      manager.record(scope, "tokens_total", 500);
      expect(manager.getUsage(scope, "tokens_total")).toBe(500);

      const cleared = manager.clearUsage(scope);
      expect(cleared).toBe(1);
      expect(manager.getUsage(scope, "tokens_total")).toBe(0);
    });
  });

  describe("presets", () => {
    it("should have free tier preset", () => {
      expect(QUOTA_PRESETS.free).toBeDefined();
      expect(QUOTA_PRESETS.free.limits.tokens_total?.max).toBe(100_000);
    });

    it("should have pro tier preset", () => {
      expect(QUOTA_PRESETS.pro).toBeDefined();
      expect(QUOTA_PRESETS.pro.limits.tokens_total?.max).toBe(1_000_000);
    });

    it("should have enterprise tier preset", () => {
      expect(QUOTA_PRESETS.enterprise).toBeDefined();
      expect(QUOTA_PRESETS.enterprise.limits.tokens_total?.max).toBe(10_000_000);
    });
  });

  describe("createTieredQuotaManager", () => {
    it("should create manager with tier defaults", () => {
      const freeManager = createTieredQuotaManager("free");
      const userScope: QuotaScope = { type: "user", id: "any" };

      const config = freeManager.getQuota(userScope);
      expect(config?.limits.tokens_total?.max).toBe(100_000);

      freeManager.dispose();
    });

    it("should apply different tiers", () => {
      const proManager = createTieredQuotaManager("pro");
      const userScope: QuotaScope = { type: "user", id: "any" };

      const config = proManager.getQuota(userScope);
      expect(config?.limits.tokens_total?.max).toBe(1_000_000);

      proManager.dispose();
    });
  });

  describe("multiple scopes", () => {
    it("should track usage independently per scope", () => {
      const user1: QuotaScope = { type: "user", id: "user-1" };
      const user2: QuotaScope = { type: "user", id: "user-2" };

      const config = {
        limits: {
          tokens_total: { max: 1000, windowMs: 60000, action: "block" as const },
        },
      };

      manager.setQuota(user1, config);
      manager.setQuota(user2, config);

      manager.record(user1, "tokens_total", 500);
      manager.record(user2, "tokens_total", 200);

      expect(manager.getUsage(user1, "tokens_total")).toBe(500);
      expect(manager.getUsage(user2, "tokens_total")).toBe(200);
    });

    it("should handle different scope types", () => {
      const user: QuotaScope = { type: "user", id: "user-1" };
      const session: QuotaScope = { type: "session", id: "session-1" };
      const agent: QuotaScope = { type: "agent", id: "agent-1" };

      manager.setQuota(user, {
        limits: {
          tokens_total: { max: 10000, windowMs: 0, action: "block" },
        },
      });

      manager.setQuota(session, {
        limits: {
          tokens_total: { max: 1000, windowMs: 0, action: "block" },
        },
      });

      manager.setQuota(agent, {
        limits: {
          tokens_total: { max: 500, windowMs: 0, action: "block" },
        },
      });

      // Agent hits limit first
      manager.record(agent, "tokens_total", 400);
      expect(manager.check(agent, "tokens_total", 200).allowed).toBe(false);

      // Session still has room
      expect(manager.check(session, "tokens_total", 200).allowed).toBe(true);

      // User has plenty
      expect(manager.check(user, "tokens_total", 5000).allowed).toBe(true);
    });
  });
});
