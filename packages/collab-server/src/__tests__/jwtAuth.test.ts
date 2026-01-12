/**
 * JWT Auth Adapter Tests
 */

import { describe, expect, it } from "vitest";
import { JwtAuthAdapter } from "../auth/jwtAuth";

const TEST_SECRET = "test-secret-12345";

describe("JwtAuthAdapter", () => {
  const adapter = new JwtAuthAdapter({ secret: TEST_SECRET });

  describe("authenticate", () => {
    it("should reject missing token", async () => {
      const result = await adapter.authenticate({
        docId: "doc-1",
        clientId: "client-1",
        // No token
      });

      expect(result.authenticated).toBe(false);
      expect(result.reason).toContain("Missing");
    });

    it("should accept valid token", async () => {
      const token = JwtAuthAdapter.generateTestToken(TEST_SECRET, {
        sub: "user-1",
        role: "editor",
      });

      const result = await adapter.authenticate({
        docId: "doc-1",
        clientId: "client-1",
        token,
      });

      expect(result.authenticated).toBe(true);
      expect(result.userId).toBe("user-1");
      expect(result.role).toBe("editor");
    });

    it("should reject invalid token", async () => {
      const result = await adapter.authenticate({
        docId: "doc-1",
        clientId: "client-1",
        token: "invalid-token",
      });

      expect(result.authenticated).toBe(false);
      expect(result.reason).toContain("Invalid");
    });

    it("should reject expired token", async () => {
      const token = JwtAuthAdapter.generateTestToken(
        TEST_SECRET,
        { sub: "user-1" },
        -1 // Already expired (negative seconds)
      );

      const result = await adapter.authenticate({
        docId: "doc-1",
        clientId: "client-1",
        token,
      });

      expect(result.authenticated).toBe(false);
      expect(result.reason).toContain("expired");
    });

    it("should reject token with wrong document scope", async () => {
      const token = JwtAuthAdapter.generateTestToken(TEST_SECRET, {
        sub: "user-1",
        docId: "other-doc",
      });

      const result = await adapter.authenticate({
        docId: "doc-1",
        clientId: "client-1",
        token,
      });

      expect(result.authenticated).toBe(false);
      expect(result.reason).toContain("not valid for document");
    });

    it("should accept token with matching document scope", async () => {
      const token = JwtAuthAdapter.generateTestToken(TEST_SECRET, {
        sub: "user-1",
        docId: "doc-1",
        role: "admin",
      });

      const result = await adapter.authenticate({
        docId: "doc-1",
        clientId: "client-1",
        token,
      });

      expect(result.authenticated).toBe(true);
      expect(result.role).toBe("admin");
    });
  });

  describe("authorize", () => {
    it("should allow read for viewer", async () => {
      const token = JwtAuthAdapter.generateTestToken(TEST_SECRET, {
        sub: "user-1",
        role: "viewer",
      });

      const allowed = await adapter.authorize(
        { docId: "doc-1", clientId: "client-1", token },
        "read"
      );

      expect(allowed).toBe(true);
    });

    it("should deny write for viewer", async () => {
      const token = JwtAuthAdapter.generateTestToken(TEST_SECRET, {
        sub: "user-1",
        role: "viewer",
      });

      const allowed = await adapter.authorize(
        { docId: "doc-1", clientId: "client-1", token },
        "write"
      );

      expect(allowed).toBe(false);
    });

    it("should allow write for editor", async () => {
      const token = JwtAuthAdapter.generateTestToken(TEST_SECRET, {
        sub: "user-1",
        role: "editor",
      });

      const allowed = await adapter.authorize(
        { docId: "doc-1", clientId: "client-1", token },
        "write"
      );

      expect(allowed).toBe(true);
    });

    it("should allow admin for admin role", async () => {
      const token = JwtAuthAdapter.generateTestToken(TEST_SECRET, {
        sub: "user-1",
        role: "admin",
      });

      const allowed = await adapter.authorize(
        { docId: "doc-1", clientId: "client-1", token },
        "admin"
      );

      expect(allowed).toBe(true);
    });

    it("should deny admin for editor", async () => {
      const token = JwtAuthAdapter.generateTestToken(TEST_SECRET, {
        sub: "user-1",
        role: "editor",
      });

      const allowed = await adapter.authorize(
        { docId: "doc-1", clientId: "client-1", token },
        "admin"
      );

      expect(allowed).toBe(false);
    });
  });

  describe("allowMissingToken mode", () => {
    it("should allow anonymous when enabled", async () => {
      const devAdapter = new JwtAuthAdapter({
        secret: TEST_SECRET,
        allowMissingToken: true,
      });

      const result = await devAdapter.authenticate({
        docId: "doc-1",
        clientId: "client-1",
        // No token
      });

      expect(result.authenticated).toBe(true);
      expect(result.userId).toContain("anonymous");
      expect(result.role).toBe("viewer");
    });
  });
});
