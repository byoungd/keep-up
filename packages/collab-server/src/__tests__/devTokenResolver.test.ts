/**
 * Collaboration Permissions - DevTokenResolver Property Tests
 *
 * Property-based tests for token parsing and validation.
 * Uses fast-check for generating random test inputs.
 *
 * **Feature: collab-permissions-audit, Property 2: Token Parsing and Validation**
 * **Validates: Requirements 3.2, 4.2, 4.4**
 */

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { DevTokenResolver } from "../auth/devTokenResolver";
import type { Role } from "../permissions/types";

// ============================================================================
// Arbitraries (Generators)
// ============================================================================

/** Generate a valid user ID */
const userIdArb = fc.string({ minLength: 1, maxLength: 50 }).filter((s) => !s.includes(":"));

/** Generate a valid document ID */
const docIdArb = fc.string({ minLength: 1, maxLength: 50 }).filter((s) => !s.includes(":"));

/** Generate a valid role */
const roleArb: fc.Arbitrary<Role> = fc.constantFrom("editor" as const, "viewer" as const);

/** Generate a secret for HMAC */
const secretArb = fc.string({ minLength: 16, maxLength: 64 });

// ============================================================================
// Property Tests
// ============================================================================

describe("DevTokenResolver Property Tests", () => {
  /**
   * **Feature: collab-permissions-audit, Property 2: Token Parsing and Validation**
   *
   * For any valid token containing userId and role, the TokenResolver SHALL extract
   * the correct userId and role. For any invalid or malformed token, the TokenResolver
   * SHALL return `INVALID_TOKEN` error.
   *
   * **Validates: Requirements 3.2, 4.2, 4.4**
   */
  describe("Property 2: Token Parsing and Validation", () => {
    it("HMAC tokens round-trip correctly", async () => {
      await fc.assert(
        fc.asyncProperty(
          secretArb,
          userIdArb,
          roleArb,
          fc.option(docIdArb, { nil: undefined }),
          async (secret, userId, role, docId) => {
            const resolver = new DevTokenResolver({
              defaultRole: "viewer",
              secret,
            });

            // Generate token
            const token = resolver.generateToken(userId, role, docId);

            // Resolve token
            const result = await resolver.resolve(token, docId);

            // Should be valid
            expect(result.valid).toBe(true);
            if (result.valid) {
              expect(result.payload.userId).toBe(userId);
              expect(result.payload.role).toBe(role);
              if (docId) {
                expect(result.payload.docId).toBe(docId);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("allowlist tokens resolve correctly", async () => {
      await fc.assert(
        fc.asyncProperty(userIdArb, docIdArb, roleArb, async (userId, docId, role) => {
          const resolver = new DevTokenResolver({
            defaultRole: "viewer",
            allowlist: new Map([[docId, new Map([[userId, role]])]]),
          });

          // Token format: userId:docId
          const token = `${userId}:${docId}`;
          const result = await resolver.resolve(token, docId);

          expect(result.valid).toBe(true);
          if (result.valid) {
            expect(result.payload.userId).toBe(userId);
            expect(result.payload.role).toBe(role);
            expect(result.payload.docId).toBe(docId);
          }
        }),
        { numRuns: 100 }
      );
    });

    it("anonymous access returns default role", async () => {
      await fc.assert(
        fc.asyncProperty(roleArb, async (defaultRole) => {
          const resolver = new DevTokenResolver({ defaultRole });

          const result = await resolver.resolve(undefined);

          expect(result.valid).toBe(true);
          if (result.valid) {
            expect(result.payload.role).toBe(defaultRole);
            expect(result.payload.userId).toMatch(/^anon-/);
          }
        }),
        { numRuns: 100 }
      );
    });

    it("invalid tokens return INVALID_TOKEN error", async () => {
      await fc.assert(
        fc.asyncProperty(fc.string({ minLength: 1, maxLength: 100 }), async (randomToken) => {
          const resolver = new DevTokenResolver({
            defaultRole: "viewer",
            secret: "test-secret-key-12345",
          });

          // Random strings should not be valid HMAC tokens
          const result = await resolver.resolve(randomToken);

          // Either invalid or happens to match allowlist format
          // (which would fail since no allowlist is configured)
          expect(result.valid).toBe(false);
          if (!result.valid) {
            expect(result.error).toBe("INVALID_TOKEN");
          }
        }),
        { numRuns: 100 }
      );
    });

    it("tampered HMAC tokens are rejected", async () => {
      await fc.assert(
        fc.asyncProperty(secretArb, userIdArb, roleArb, async (secret, userId, role) => {
          const resolver = new DevTokenResolver({
            defaultRole: "viewer",
            secret,
          });

          // Generate valid token
          const token = resolver.generateToken(userId, role);

          // Tamper with the signature (flip a character)
          const parts = token.split(":");
          const tamperedSig =
            parts[1].charAt(0) === "a" ? `b${parts[1].slice(1)}` : `a${parts[1].slice(1)}`;
          const tamperedToken = `${parts[0]}:${tamperedSig}`;

          // Should be rejected
          const result = await resolver.resolve(tamperedToken);
          expect(result.valid).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it("docId scope is enforced for HMAC tokens", async () => {
      await fc.assert(
        fc.asyncProperty(
          secretArb,
          userIdArb,
          roleArb,
          docIdArb,
          docIdArb.filter((d) => d.length > 0),
          async (secret, userId, role, tokenDocId, requestDocId) => {
            // Skip if docIds happen to be the same
            fc.pre(tokenDocId !== requestDocId);

            const resolver = new DevTokenResolver({
              defaultRole: "viewer",
              secret,
            });

            // Generate token scoped to tokenDocId
            const token = resolver.generateToken(userId, role, tokenDocId);

            // Try to use it for a different docId
            const result = await resolver.resolve(token, requestDocId);

            // Should be rejected due to scope mismatch
            expect(result.valid).toBe(false);
            if (!result.valid) {
              expect(result.error).toBe("INVALID_TOKEN");
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});

// ============================================================================
// Unit Tests for Edge Cases
// ============================================================================

describe("DevTokenResolver Unit Tests", () => {
  describe("allowlist management", () => {
    it("addToAllowlist creates new entries", async () => {
      const resolver = new DevTokenResolver({ defaultRole: "viewer" });

      resolver.addToAllowlist("doc1", "user1", "editor");

      const result = await resolver.resolve("user1:doc1", "doc1");
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.payload.role).toBe("editor");
      }
    });

    it("removeFromAllowlist removes entries", async () => {
      const resolver = new DevTokenResolver({ defaultRole: "viewer" });

      resolver.addToAllowlist("doc1", "user1", "editor");
      resolver.removeFromAllowlist("doc1", "user1");

      const result = await resolver.resolve("user1:doc1", "doc1");
      expect(result.valid).toBe(false);
    });

    it("allowlist lookup fails for unknown user", async () => {
      const resolver = new DevTokenResolver({
        defaultRole: "viewer",
        allowlist: new Map([["doc1", new Map([["user1", "editor" as Role]])]]),
      });

      const result = await resolver.resolve("unknown:doc1", "doc1");
      expect(result.valid).toBe(false);
    });

    it("allowlist lookup fails for unknown doc", async () => {
      const resolver = new DevTokenResolver({
        defaultRole: "viewer",
        allowlist: new Map([["doc1", new Map([["user1", "editor" as Role]])]]),
      });

      const result = await resolver.resolve("user1:unknown", "unknown");
      expect(result.valid).toBe(false);
    });
  });

  describe("HMAC token generation", () => {
    it("throws without secret", () => {
      const resolver = new DevTokenResolver({ defaultRole: "viewer" });

      expect(() => resolver.generateToken("user1", "editor")).toThrow(
        "Cannot generate token without secret"
      );
    });

    it("generates different tokens for different inputs", () => {
      const resolver = new DevTokenResolver({
        defaultRole: "viewer",
        secret: "test-secret",
      });

      const token1 = resolver.generateToken("user1", "editor");
      const token2 = resolver.generateToken("user2", "editor");
      const token3 = resolver.generateToken("user1", "viewer");

      expect(token1).not.toBe(token2);
      expect(token1).not.toBe(token3);
      expect(token2).not.toBe(token3);
    });
  });

  describe("token format validation", () => {
    it("empty string is treated as no token (anonymous)", async () => {
      const resolver = new DevTokenResolver({
        defaultRole: "viewer",
        secret: "test-secret",
      });

      // Empty string is falsy, so treated as no token
      const result = await resolver.resolve("");
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.payload.userId).toMatch(/^anon-/);
      }
    });

    it("rejects malformed HMAC token (no colon)", async () => {
      const resolver = new DevTokenResolver({
        defaultRole: "viewer",
        secret: "test-secret",
      });

      const result = await resolver.resolve("notavalidtoken");
      expect(result.valid).toBe(false);
    });

    it("rejects HMAC token with invalid role", async () => {
      const resolver = new DevTokenResolver({
        defaultRole: "viewer",
        secret: "test-secret",
      });

      // Manually create a token with invalid role
      const payloadB64 = Buffer.from("user1:admin").toString("base64");
      const { createHmac } = await import("node:crypto");
      const signature = createHmac("sha256", "test-secret").update(payloadB64).digest("hex");
      const token = `${payloadB64}:${signature}`;

      const result = await resolver.resolve(token);
      expect(result.valid).toBe(false);
    });
  });
});
