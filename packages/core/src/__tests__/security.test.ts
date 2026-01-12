/**
 * LFCC v0.9 RC - Track 11: Security Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AllowAllAuthAdapter, type AuthContext, TokenAuthAdapter } from "../security/auth";
import { SlidingWindowRateLimiter, TokenBucketRateLimiter } from "../security/rateLimit";
import {
  DEFAULT_VALIDATION_CONFIG,
  validateMessageSchema,
  validateMessageSize,
  validatePresencePayload,
  validateUpdatePayload,
} from "../security/validation";

describe("Track 11: Security", () => {
  describe("AuthAdapter", () => {
    describe("AllowAllAuthAdapter", () => {
      it("should authenticate all requests", async () => {
        const adapter = new AllowAllAuthAdapter();
        const context: AuthContext = { docId: "doc1", clientId: "client1" };

        const result = await adapter.authenticate(context);

        expect(result.authenticated).toBe(true);
        expect(result.role).toBe("editor");
      });

      it("should authorize all actions", async () => {
        const adapter = new AllowAllAuthAdapter();
        const context: AuthContext = { docId: "doc1", clientId: "client1" };

        expect(await adapter.authorize(context, "read")).toBe(true);
        expect(await adapter.authorize(context, "write")).toBe(true);
        expect(await adapter.authorize(context, "admin")).toBe(true);
      });
    });

    describe("TokenAuthAdapter", () => {
      it("should reject missing token", async () => {
        const adapter = new TokenAuthAdapter(async () => ({ valid: false }));
        const context: AuthContext = { docId: "doc1", clientId: "client1" };

        const result = await adapter.authenticate(context);

        expect(result.authenticated).toBe(false);
        expect(result.reason).toBe("Missing token");
      });

      it("should reject invalid token", async () => {
        const adapter = new TokenAuthAdapter(async () => ({ valid: false }));
        const context: AuthContext = {
          docId: "doc1",
          clientId: "client1",
          token: "invalid",
        };

        const result = await adapter.authenticate(context);

        expect(result.authenticated).toBe(false);
        expect(result.reason).toBe("Invalid token");
      });

      it("should accept valid token", async () => {
        const adapter = new TokenAuthAdapter(async () => ({
          valid: true,
          userId: "user1",
          role: "editor",
        }));
        const context: AuthContext = {
          docId: "doc1",
          clientId: "client1",
          token: "valid-token",
        };

        const result = await adapter.authenticate(context);

        expect(result.authenticated).toBe(true);
        expect(result.userId).toBe("user1");
        expect(result.role).toBe("editor");
      });

      it("should authorize based on role", async () => {
        const adapter = new TokenAuthAdapter(async () => ({
          valid: true,
          userId: "user1",
          role: "viewer",
        }));
        const context: AuthContext = {
          docId: "doc1",
          clientId: "client1",
          token: "valid",
        };

        expect(await adapter.authorize(context, "read")).toBe(true);
        expect(await adapter.authorize(context, "write")).toBe(false);
        expect(await adapter.authorize(context, "admin")).toBe(false);
      });
    });
  });

  describe("RateLimiter", () => {
    describe("TokenBucketRateLimiter", () => {
      let limiter: TokenBucketRateLimiter;

      beforeEach(() => {
        limiter = new TokenBucketRateLimiter({
          maxTokens: 10,
          refillRate: 1,
          initialTokens: 10,
          maxKeys: 100,
        });
      });

      afterEach(() => {
        limiter.shutdown();
      });

      it("should allow requests within limit", () => {
        for (let i = 0; i < 10; i++) {
          const result = limiter.consume("client1");
          expect(result.allowed).toBe(true);
        }
      });

      it("should reject requests exceeding limit", () => {
        // Exhaust tokens
        for (let i = 0; i < 10; i++) {
          limiter.consume("client1");
        }

        const result = limiter.consume("client1");
        expect(result.allowed).toBe(false);
        expect(result.retryAfter).toBeGreaterThan(0);
      });

      it("should track separate buckets per key", () => {
        for (let i = 0; i < 10; i++) {
          limiter.consume("client1");
        }

        expect(limiter.consume("client1").allowed).toBe(false);
        expect(limiter.consume("client2").allowed).toBe(true);
      });

      it("should reset bucket", () => {
        for (let i = 0; i < 10; i++) {
          limiter.consume("client1");
        }
        expect(limiter.consume("client1").allowed).toBe(false);

        limiter.reset("client1");
        expect(limiter.consume("client1").allowed).toBe(true);
      });

      it("should evict least-recently-used buckets when maxKeys exceeded", () => {
        const lruLimiter = new TokenBucketRateLimiter({
          maxTokens: 1,
          refillRate: 1,
          initialTokens: 1,
          maxKeys: 2,
        });

        lruLimiter.consume("client-a");
        lruLimiter.consume("client-b");
        lruLimiter.consume("client-a"); // keep hot
        lruLimiter.consume("client-c"); // triggers eviction

        expect(lruLimiter.hasBucket("client-a")).toBe(true);
        expect(lruLimiter.hasBucket("client-b")).toBe(false);
        expect(lruLimiter.hasBucket("client-c")).toBe(true);

        lruLimiter.shutdown();
      });

      it("should auto-start cleanup and evict buckets after TTL expiration", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(0));

        const ttlLimiter = new TokenBucketRateLimiter({
          maxTokens: 1,
          refillRate: 1,
          initialTokens: 1,
          bucketTtlMs: 500,
          cleanupIntervalMs: 100,
          maxKeys: 10,
        });

        ttlLimiter.consume("client-ttl");

        // Advance past TTL + cleanup interval
        vi.advanceTimersByTime(700);

        expect(ttlLimiter.hasBucket("client-ttl")).toBe(false);

        ttlLimiter.shutdown();
        vi.useRealTimers();
      });

      it("should stay bounded under many keys", () => {
        const boundedLimiter = new TokenBucketRateLimiter({
          maxTokens: 1,
          refillRate: 1,
          initialTokens: 1,
          maxKeys: 5,
          cleanupIntervalMs: 0,
        });

        for (let i = 0; i < 50; i++) {
          boundedLimiter.consume(`client-${i}`);
          expect(boundedLimiter.getBucketCount()).toBeLessThanOrEqual(5);
        }

        boundedLimiter.shutdown();
      });
    });

    describe("SlidingWindowRateLimiter", () => {
      it("should limit per-second requests", () => {
        const limiter = new SlidingWindowRateLimiter(5);

        for (let i = 0; i < 5; i++) {
          expect(limiter.consume("client1").allowed).toBe(true);
        }
        expect(limiter.consume("client1").allowed).toBe(false);
        limiter.shutdown();
      });

      it("should evict inactive windows and enforce maxKeys", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(0));

        const limiter = new SlidingWindowRateLimiter({
          maxRequestsPerSecond: 2,
          windowTtlMs: 1000,
          cleanupIntervalMs: 1000,
          maxKeys: 2,
          maxTimestampsPerKey: 2,
        });

        limiter.startCleanup();
        limiter.consume("client-a");
        limiter.consume("client-b");
        limiter.consume("client-a"); // keep hot
        limiter.consume("client-c"); // triggers eviction

        expect(limiter.hasWindow("client-a")).toBe(true);
        expect(limiter.hasWindow("client-b")).toBe(false);
        expect(limiter.hasWindow("client-c")).toBe(true);

        vi.advanceTimersByTime(1001);
        expect(limiter.hasWindow("client-a")).toBe(false);

        limiter.shutdown();
        vi.useRealTimers();
      });

      it("should auto-start cleanup and expire idle keys", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(0));

        const limiter = new SlidingWindowRateLimiter({
          maxRequestsPerSecond: 1,
          windowTtlMs: 200,
          cleanupIntervalMs: 50,
        });

        limiter.consume("client-auto");
        vi.advanceTimersByTime(250);

        expect(limiter.hasWindow("client-auto")).toBe(false);

        limiter.shutdown();
        vi.useRealTimers();
      });

      it("should stop cleanup when requested", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(0));

        const limiter = new SlidingWindowRateLimiter({
          maxRequestsPerSecond: 1,
          windowTtlMs: 200,
          cleanupIntervalMs: 50,
        });

        limiter.consume("client-stop");
        limiter.stopCleanup();
        vi.advanceTimersByTime(250);

        expect(limiter.hasWindow("client-stop")).toBe(true);

        limiter.shutdown();
        vi.useRealTimers();
      });

      it("should remove empty keys when window expires", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(0));

        const limiter = new SlidingWindowRateLimiter({
          maxRequestsPerSecond: 1,
          windowTtlMs: 10000,
          cleanupIntervalMs: 50,
        });

        limiter.consume("client-empty");
        vi.advanceTimersByTime(1100);

        expect(limiter.hasWindow("client-empty")).toBe(false);

        limiter.shutdown();
        vi.useRealTimers();
      });

      it("should stay bounded under many keys", () => {
        const limiter = new SlidingWindowRateLimiter({
          maxRequestsPerSecond: 1,
          maxKeys: 5,
          cleanupIntervalMs: 0,
        });

        for (let i = 0; i < 50; i++) {
          limiter.consume(`client-${i}`);
          expect(limiter.getWindowCount()).toBeLessThanOrEqual(5);
        }

        limiter.shutdown();
      });
    });
  });

  describe("Validation", () => {
    describe("validateMessageSize", () => {
      it("should allow normal messages", () => {
        const result = validateMessageSize("hello");
        expect(result.valid).toBe(true);
      });

      it("should reject oversized messages", () => {
        const config = { ...DEFAULT_VALIDATION_CONFIG, maxMessageSize: 10 };
        const result = validateMessageSize("a".repeat(100), config);

        expect(result.valid).toBe(false);
        expect(result.code).toBe("SIZE_EXCEEDED");
      });
    });

    describe("validateMessageSchema", () => {
      it("should accept valid message", () => {
        const result = validateMessageSchema({
          type: "ping",
          docId: "doc1",
          clientId: "client1",
          seq: 1,
          payload: {},
        });
        expect(result.valid).toBe(true);
      });

      it("should reject missing type", () => {
        const result = validateMessageSchema({
          docId: "doc1",
          clientId: "client1",
        });
        expect(result.valid).toBe(false);
        expect(result.code).toBe("MISSING_FIELD");
      });

      it("should reject unknown type", () => {
        const result = validateMessageSchema({
          type: "unknown_type",
          docId: "doc1",
          clientId: "client1",
        });
        expect(result.valid).toBe(false);
        expect(result.code).toBe("INVALID_TYPE");
      });
    });

    describe("validateUpdatePayload", () => {
      it("should accept normal update", () => {
        const result = validateUpdatePayload({
          updateData: "base64data",
          sizeBytes: 100,
        });
        expect(result.valid).toBe(true);
      });

      it("should reject oversized update", () => {
        const config = { ...DEFAULT_VALIDATION_CONFIG, maxUpdateSize: 10 };
        const result = validateUpdatePayload(
          { updateData: "a".repeat(100), sizeBytes: 100 },
          config
        );
        expect(result.valid).toBe(false);
        expect(result.code).toBe("SIZE_EXCEEDED");
      });
    });

    describe("validatePresencePayload", () => {
      it("should accept normal presence", () => {
        const result = validatePresencePayload({
          userMeta: { userId: "u1", displayName: "User" },
          status: "active",
        });
        expect(result.valid).toBe(true);
      });

      it("should reject oversized presence", () => {
        const config = { ...DEFAULT_VALIDATION_CONFIG, maxPresenceSize: 10 };
        const result = validatePresencePayload({ data: "x".repeat(1000) }, config);
        expect(result.valid).toBe(false);
        expect(result.code).toBe("SIZE_EXCEEDED");
      });
    });
  });
});
