/**
 * Collaboration Permissions - Dev Mode Token Resolver
 *
 * A simple token resolver for development and testing.
 * Supports in-memory allowlist and HMAC token validation.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { Role } from "../permissions/types";
import type { TokenPayload, TokenResolver, TokenResult } from "./tokenResolver";

/** Configuration for dev token resolver */
export type DevTokenConfig = {
  /** Default role for anonymous users (no token) */
  defaultRole: Role;
  /** In-memory allowlist: docId -> userId -> role */
  allowlist?: Map<string, Map<string, Role>>;
  /** Secret for HMAC token validation */
  secret?: string;
};

/**
 * Dev mode token resolver.
 *
 * Supports three authentication methods:
 * 1. Anonymous access with default role (when no token provided)
 * 2. In-memory allowlist lookup (token format: userId:docId)
 * 3. HMAC token validation (token format: base64(userId:role:docId):signature)
 */
export class DevTokenResolver implements TokenResolver {
  private config: DevTokenConfig;

  constructor(config: DevTokenConfig) {
    this.config = config;
  }

  async resolve(token: string | undefined, docId?: string): Promise<TokenResult> {
    // No token - return anonymous with default role
    if (!token) {
      return {
        valid: true,
        payload: {
          userId: `anon-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          role: this.config.defaultRole,
        },
      };
    }

    // Try HMAC token format first
    const hmacResult = this.tryHmacToken(token, docId);
    if (hmacResult) {
      return hmacResult;
    }

    // Try allowlist lookup
    const allowlistResult = this.tryAllowlist(token, docId);
    if (allowlistResult) {
      return allowlistResult;
    }

    // Invalid token
    return { valid: false, error: "INVALID_TOKEN" };
  }

  /**
   * Try to parse and validate an HMAC token.
   * Format: base64(userId:role:docId):signature
   */
  private tryHmacToken(token: string, docId?: string): TokenResult | null {
    if (!this.config.secret) {
      return null;
    }

    const parts = token.split(":");
    if (parts.length !== 2) {
      return null;
    }

    const [payloadB64, signature] = parts;

    // Verify signature
    const expectedSig = createHmac("sha256", this.config.secret).update(payloadB64).digest("hex");

    // Use timing-safe comparison to prevent timing attacks
    try {
      const sigBuffer = Buffer.from(signature, "hex");
      const expectedBuffer = Buffer.from(expectedSig, "hex");
      if (
        sigBuffer.length !== expectedBuffer.length ||
        !timingSafeEqual(sigBuffer, expectedBuffer)
      ) {
        return null;
      }
    } catch {
      return null;
    }

    // Decode payload
    try {
      const payloadStr = Buffer.from(payloadB64, "base64").toString("utf-8");
      const payloadParts = payloadStr.split(":");
      if (payloadParts.length < 2 || payloadParts.length > 3) {
        return null;
      }

      const [userId, role, tokenDocId] = payloadParts;

      // Validate role
      if (role !== "editor" && role !== "viewer") {
        return null;
      }

      // Check docId scope if present
      if (tokenDocId && docId && tokenDocId !== docId) {
        return { valid: false, error: "INVALID_TOKEN" };
      }

      const payload: TokenPayload = {
        userId,
        role: role as Role,
      };
      if (tokenDocId) {
        payload.docId = tokenDocId;
      }

      return { valid: true, payload };
    } catch {
      return null;
    }
  }

  /**
   * Try to lookup token in allowlist.
   * Format: userId:docId
   */
  private tryAllowlist(token: string, docId?: string): TokenResult | null {
    if (!this.config.allowlist) {
      return null;
    }

    const parts = token.split(":");
    if (parts.length !== 2) {
      return null;
    }

    const [userId, tokenDocId] = parts;

    // Use provided docId or token docId
    const lookupDocId = docId ?? tokenDocId;
    if (!lookupDocId) {
      return null;
    }

    const docAllowlist = this.config.allowlist.get(lookupDocId);
    if (!docAllowlist) {
      return null;
    }

    const role = docAllowlist.get(userId);
    if (!role) {
      return null;
    }

    return {
      valid: true,
      payload: {
        userId,
        role,
        docId: lookupDocId,
      },
    };
  }

  /**
   * Generate an HMAC token for testing.
   * @param userId - User identifier
   * @param role - User role
   * @param docId - Optional document scope
   * @returns Signed token string
   */
  generateToken(userId: string, role: Role, docId?: string): string {
    if (!this.config.secret) {
      throw new Error("Cannot generate token without secret");
    }

    const payloadParts = [userId, role];
    if (docId) {
      payloadParts.push(docId);
    }

    const payloadB64 = Buffer.from(payloadParts.join(":")).toString("base64");
    const signature = createHmac("sha256", this.config.secret).update(payloadB64).digest("hex");

    return `${payloadB64}:${signature}`;
  }

  /**
   * Add an entry to the allowlist.
   */
  addToAllowlist(docId: string, userId: string, role: Role): void {
    if (!this.config.allowlist) {
      this.config.allowlist = new Map();
    }

    let docAllowlist = this.config.allowlist.get(docId);
    if (!docAllowlist) {
      docAllowlist = new Map();
      this.config.allowlist.set(docId, docAllowlist);
    }

    docAllowlist.set(userId, role);
  }

  /**
   * Remove an entry from the allowlist.
   */
  removeFromAllowlist(docId: string, userId: string): void {
    const docAllowlist = this.config.allowlist?.get(docId);
    if (docAllowlist) {
      docAllowlist.delete(userId);
      if (docAllowlist.size === 0) {
        this.config.allowlist?.delete(docId);
      }
    }
  }
}
