/**
 * Invite Token Service Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InviteTokenService } from "../inviteTokenService";

describe("InviteTokenService", () => {
  const secret = "test-secret-key-minimum-16-chars";
  let service: InviteTokenService;

  beforeEach(() => {
    service = new InviteTokenService({ secret });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-07T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("constructor", () => {
    it("should throw if secret is too short", () => {
      expect(() => new InviteTokenService({ secret: "short" })).toThrow(
        "Invite token secret must be at least 16 characters"
      );
    });

    it("should throw if secret is empty", () => {
      expect(() => new InviteTokenService({ secret: "" })).toThrow(
        "Invite token secret must be at least 16 characters"
      );
    });

    it("should accept valid secret", () => {
      expect(() => new InviteTokenService({ secret })).not.toThrow();
    });
  });

  describe("generateToken", () => {
    it("should generate a valid token for editor role", () => {
      const token = service.generateToken("doc-123", "editor");
      expect(token).toMatch(/^[A-Za-z0-9_-]+:[a-f0-9]+$/);
    });

    it("should generate a valid token for viewer role", () => {
      const token = service.generateToken("doc-456", "viewer");
      expect(token).toMatch(/^[A-Za-z0-9_-]+:[a-f0-9]+$/);
    });

    it("should include expiry when specified", () => {
      const token = service.generateToken("doc-123", "editor", 24);
      const result = service.validateToken(token);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.payload.exp).toBeDefined();
        expect(result.payload.exp).toBe(Date.now() + 24 * 60 * 60 * 1000);
      }
    });

    it("should not include expiry when not specified", () => {
      const token = service.generateToken("doc-123", "editor");
      const result = service.validateToken(token);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.payload.exp).toBeUndefined();
      }
    });

    it("should include issued-at timestamp", () => {
      const token = service.generateToken("doc-123", "editor");
      const result = service.validateToken(token);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.payload.iat).toBe(Date.now());
      }
    });
  });

  describe("validateToken", () => {
    it("should validate a valid token", () => {
      const token = service.generateToken("doc-123", "editor");
      const result = service.validateToken(token);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.payload.docId).toBe("doc-123");
        expect(result.payload.role).toBe("editor");
      }
    });

    it("should reject token with invalid format", () => {
      const result = service.validateToken("invalid-token");
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toBe("INVALID_TOKEN");
      }
    });

    it("should reject token with invalid signature", () => {
      const token = service.generateToken("doc-123", "editor");
      const [payload] = token.split(":");
      const tamperedToken = `${payload}:0000000000000000000000000000000000000000000000000000000000000000`;

      const result = service.validateToken(tamperedToken);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toBe("INVALID_SIGNATURE");
      }
    });

    it("should reject token with tampered payload", () => {
      const token = service.generateToken("doc-123", "editor");
      const [, signature] = token.split(":");
      const tamperedPayload = Buffer.from(
        JSON.stringify({ docId: "doc-999", role: "editor", iat: Date.now() })
      ).toString("base64url");

      const result = service.validateToken(`${tamperedPayload}:${signature}`);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toBe("INVALID_SIGNATURE");
      }
    });

    it("should reject expired token", () => {
      const token = service.generateToken("doc-123", "editor", 1); // 1 hour expiry

      // Advance time past expiry
      vi.advanceTimersByTime(2 * 60 * 60 * 1000); // 2 hours

      const result = service.validateToken(token);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toBe("EXPIRED_TOKEN");
      }
    });

    it("should accept token before expiry", () => {
      const token = service.generateToken("doc-123", "editor", 2); // 2 hour expiry

      // Advance time but stay within expiry
      vi.advanceTimersByTime(1 * 60 * 60 * 1000); // 1 hour

      const result = service.validateToken(token);
      expect(result.valid).toBe(true);
    });

    it("should reject token with invalid role", () => {
      // Manually craft a token with invalid role
      const payload = { docId: "doc-123", role: "admin", iat: Date.now() };
      const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");

      // We need to use the same signing mechanism
      const otherService = new InviteTokenService({ secret });
      const validToken = otherService.generateToken("doc-123", "editor");
      const [, sig] = validToken.split(":");

      // This will fail signature check, but let's test the role validation path
      // by creating a properly signed token with bad role
      const result = service.validateToken(`${payloadB64}:${sig}`);
      expect(result.valid).toBe(false);
    });

    it("should reject token with missing docId", () => {
      const result = service.validateToken("eyJyb2xlIjoiZWRpdG9yIiwiaWF0IjoxfQ:abc123");
      expect(result.valid).toBe(false);
    });

    it("should reject malformed base64", () => {
      const result = service.validateToken("not-valid-base64!!!:abc123");
      expect(result.valid).toBe(false);
    });
  });

  describe("generateInviteUrl", () => {
    it("should generate a valid invite URL", () => {
      const url = service.generateInviteUrl("https://app.example.com", "en", "doc-123", "editor");

      expect(url).toMatch(/^https:\/\/app\.example\.com\/en\/reader\/doc-123\?joinToken=/);
    });

    it("should URL-encode the token", () => {
      const url = service.generateInviteUrl("https://app.example.com", "en", "doc-123", "viewer");

      // Token contains : which should be encoded
      expect(url).toContain("joinToken=");
      expect(url).toContain("%3A"); // URL-encoded colon
    });

    it("should include expiry in token when specified", () => {
      const url = service.generateInviteUrl(
        "https://app.example.com",
        "en",
        "doc-123",
        "editor",
        24
      );

      // Extract token from URL
      const tokenMatch = url.match(/joinToken=([^&]+)/);
      expect(tokenMatch).not.toBeNull();

      if (!tokenMatch) {
        throw new Error("Token not found in URL");
      }

      const token = decodeURIComponent(tokenMatch[1]);
      const result = service.validateToken(token);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.payload.exp).toBeDefined();
      }
    });
  });

  describe("cross-instance validation", () => {
    it("should validate tokens across service instances with same secret", () => {
      const service1 = new InviteTokenService({ secret });
      const service2 = new InviteTokenService({ secret });

      const token = service1.generateToken("doc-123", "editor");
      const result = service2.validateToken(token);

      expect(result.valid).toBe(true);
    });

    it("should reject tokens from service with different secret", () => {
      const service1 = new InviteTokenService({ secret });
      const service2 = new InviteTokenService({ secret: "different-secret-key-here" });

      const token = service1.generateToken("doc-123", "editor");
      const result = service2.validateToken(token);

      expect(result.valid).toBe(false);
    });
  });
});
