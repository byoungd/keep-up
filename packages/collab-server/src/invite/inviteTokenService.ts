/**
 * Invite Token Service
 *
 * Generates and validates invite tokens for document sharing.
 * Tokens encode docId, role, and optional expiry.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { Role } from "../permissions/types";

/** Invite token payload */
export interface InviteTokenPayload {
  /** Document ID */
  docId: string;
  /** Assigned role */
  role: Role;
  /** Expiry timestamp (ms since epoch) */
  exp?: number;
  /** Issued at timestamp (ms since epoch) */
  iat: number;
}

/** Invite token validation result */
export type InviteTokenResult =
  | { valid: true; payload: InviteTokenPayload }
  | { valid: false; error: "INVALID_TOKEN" | "EXPIRED_TOKEN" | "INVALID_SIGNATURE" };

/** Invite token service configuration */
export interface InviteTokenConfig {
  /** Secret for HMAC signing */
  secret: string;
}

/**
 * Service for generating and validating invite tokens.
 */
export class InviteTokenService {
  private secret: string;

  constructor(config: InviteTokenConfig) {
    if (!config.secret || config.secret.length < 16) {
      throw new Error("Invite token secret must be at least 16 characters");
    }
    this.secret = config.secret;
  }

  /**
   * Generate an invite token for a document.
   *
   * @param docId - Document ID
   * @param role - Role to assign (editor/viewer)
   * @param expiryHours - Optional hours until expiry
   * @returns Signed token string
   */
  generateToken(docId: string, role: Role, expiryHours?: number): string {
    const now = Date.now();
    const payload: InviteTokenPayload = {
      docId,
      role,
      iat: now,
    };

    if (expiryHours !== undefined && expiryHours > 0) {
      payload.exp = now + expiryHours * 60 * 60 * 1000;
    }

    const payloadJson = JSON.stringify(payload);
    const payloadB64 = Buffer.from(payloadJson).toString("base64url");
    const signature = this.sign(payloadB64);

    return `${payloadB64}:${signature}`;
  }

  /**
   * Validate an invite token.
   *
   * @param token - Token string to validate
   * @returns Validation result with payload or error
   */
  validateToken(token: string): InviteTokenResult {
    const parts = token.split(":");
    if (parts.length !== 2) {
      return { valid: false, error: "INVALID_TOKEN" };
    }

    const [payloadB64, signature] = parts;

    // Verify signature
    if (!this.verifySignature(payloadB64, signature)) {
      return { valid: false, error: "INVALID_SIGNATURE" };
    }

    // Decode payload
    let payload: InviteTokenPayload;
    try {
      const payloadJson = Buffer.from(payloadB64, "base64url").toString("utf-8");
      payload = JSON.parse(payloadJson) as InviteTokenPayload;
    } catch {
      return { valid: false, error: "INVALID_TOKEN" };
    }

    // Validate payload structure
    if (!payload.docId || !payload.role || typeof payload.iat !== "number") {
      return { valid: false, error: "INVALID_TOKEN" };
    }

    // Validate role
    if (payload.role !== "editor" && payload.role !== "viewer") {
      return { valid: false, error: "INVALID_TOKEN" };
    }

    // Check expiry
    if (payload.exp !== undefined && Date.now() > payload.exp) {
      return { valid: false, error: "EXPIRED_TOKEN" };
    }

    return { valid: true, payload };
  }

  /**
   * Generate URL with invite token.
   *
   * @param baseUrl - Base URL (e.g., https://app.example.com)
   * @param locale - Locale code (e.g., en)
   * @param docId - Document ID
   * @param role - Role to assign
   * @param expiryHours - Optional hours until expiry
   * @returns Full invite URL
   */
  generateInviteUrl(
    baseUrl: string,
    locale: string,
    docId: string,
    role: Role,
    expiryHours?: number
  ): string {
    const token = this.generateToken(docId, role, expiryHours);
    const encodedToken = encodeURIComponent(token);
    return `${baseUrl}/${locale}/reader/${docId}?joinToken=${encodedToken}`;
  }

  /**
   * Sign a payload with HMAC-SHA256.
   */
  private sign(payload: string): string {
    return createHmac("sha256", this.secret).update(payload).digest("hex");
  }

  /**
   * Verify a signature using timing-safe comparison.
   */
  private verifySignature(payload: string, signature: string): boolean {
    const expectedSig = this.sign(payload);

    try {
      const sigBuffer = Buffer.from(signature, "hex");
      const expectedBuffer = Buffer.from(expectedSig, "hex");

      if (sigBuffer.length !== expectedBuffer.length) {
        return false;
      }

      return timingSafeEqual(sigBuffer, expectedBuffer);
    } catch {
      return false;
    }
  }
}
