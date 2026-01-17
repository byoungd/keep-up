/**
 * Production JWT Session Auth Provider
 *
 * A production-ready JWT authentication provider with proper signature verification.
 * Supports HS256, HS384, HS512 (symmetric) and RS256, RS384, RS512, ES256, ES384, ES512 (asymmetric).
 *
 * Uses Web Crypto API for cross-platform compatibility (Node.js & Browser).
 */

import {
  type AuthRole,
  createAuthFailure,
  type SessionAuthProvider,
  type SessionAuthResult,
} from "./sessionAuthProvider";

/** Supported JWT algorithms */
export type JwtAlgorithm =
  | "HS256"
  | "HS384"
  | "HS512"
  | "RS256"
  | "RS384"
  | "RS512"
  | "ES256"
  | "ES384"
  | "ES512";

/** Configuration for JWT session auth */
export interface JwtSessionAuthConfig {
  /** JWT secret (for HMAC) or public key PEM (for RSA/EC) */
  secret: string;
  /** Algorithm to use for verification (default: HS256) */
  algorithm?: JwtAlgorithm;
  /** Expected issuer (optional - validates `iss` claim) */
  issuer?: string;
  /** Expected audience (optional - validates `aud` claim) */
  audience?: string;
  /** Clock tolerance in seconds for exp/nbf validation (default: 30) */
  clockTolerance?: number;
  /** Allow missing tokens (for anonymous access) */
  allowAnonymous?: boolean;
  /** Default role for anonymous users */
  anonymousRole?: AuthRole;
  /** Skip signature verification (DEVELOPMENT ONLY - never use in production!) */
  skipVerification?: boolean;
}

/** Expected JWT payload structure */
interface JwtPayload {
  sub?: string;
  userId?: string;
  role?: AuthRole;
  docIds?: string[];
  teamId?: string;
  iss?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  iat?: number;
}

/**
 * Production JWT Session Auth Provider
 *
 * Implements proper JWT verification using Web Crypto API.
 * Supports both symmetric (HMAC) and asymmetric (RSA/EC) algorithms.
 */
export class JwtSessionAuthProvider implements SessionAuthProvider {
  private config: Required<
    Pick<
      JwtSessionAuthConfig,
      | "secret"
      | "algorithm"
      | "clockTolerance"
      | "allowAnonymous"
      | "anonymousRole"
      | "skipVerification"
    >
  > &
    Partial<JwtSessionAuthConfig>;
  private cryptoKey: CryptoKey | null = null;
  private keyInitPromise: Promise<void> | null = null;

  constructor(config: JwtSessionAuthConfig) {
    this.config = {
      secret: config.secret,
      algorithm: config.algorithm ?? "HS256",
      issuer: config.issuer,
      audience: config.audience,
      clockTolerance: config.clockTolerance ?? 30,
      allowAnonymous: config.allowAnonymous ?? false,
      anonymousRole: config.anonymousRole ?? "viewer",
      skipVerification: config.skipVerification ?? false,
    };

    // Warn about insecure mode
    if (this.config.skipVerification) {
      console.warn(
        "[JwtSessionAuthProvider] WARNING: Signature verification is DISABLED - for development only!"
      );
    }

    // Initialize crypto key lazily
    this.keyInitPromise = this.initCryptoKey();
  }

  /**
   * Initialize the cryptographic key for signature verification.
   */
  private async initCryptoKey(): Promise<void> {
    if (this.config.skipVerification) {
      return;
    }

    try {
      const algorithm = this.getWebCryptoAlgorithm();
      const keyData = this.prepareKeyData();
      // Cast to Uint8Array<ArrayBuffer> for Web Crypto API compatibility
      const keyBuffer = new Uint8Array(keyData) as Uint8Array<ArrayBuffer>;

      if (this.isHmacAlgorithm(this.config.algorithm)) {
        // HMAC key import
        this.cryptoKey = await crypto.subtle.importKey(
          "raw",
          keyBuffer,
          { name: "HMAC", hash: algorithm.hash },
          false,
          ["verify"]
        );
      } else if (this.isRsaAlgorithm(this.config.algorithm)) {
        // RSA public key import
        this.cryptoKey = await crypto.subtle.importKey(
          "spki",
          keyBuffer,
          { name: "RSASSA-PKCS1-v1_5", hash: algorithm.hash },
          false,
          ["verify"]
        );
      } else if (this.isEcAlgorithm(this.config.algorithm)) {
        // EC public key import
        const namedCurve = this.getEcCurve(this.config.algorithm);
        this.cryptoKey = await crypto.subtle.importKey(
          "spki",
          keyBuffer,
          { name: "ECDSA", namedCurve },
          false,
          ["verify"]
        );
      }
    } catch (error) {
      console.error("[JwtSessionAuthProvider] Failed to initialize crypto key:", error);
      throw createAuthFailure("UNKNOWN", "Failed to initialize JWT verification", false);
    }
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: validation requires multiple JWT checks
  async validate(token: string): Promise<SessionAuthResult> {
    // Empty token handling
    if (!token || token.length === 0) {
      if (this.config.allowAnonymous) {
        return this.createAnonymousSession();
      }
      throw createAuthFailure("MISSING_TOKEN", "Authentication token required", true);
    }

    try {
      // Parse and verify JWT with cryptographic signature validation
      const payload = await this.parseAndVerifyJwt(token);

      // Validate issuer
      if (this.config.issuer && payload.iss !== this.config.issuer) {
        throw createAuthFailure("INVALID_TOKEN", "Invalid token issuer", false);
      }

      // Validate audience
      if (this.config.audience) {
        const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
        if (!aud.includes(this.config.audience)) {
          throw createAuthFailure("INVALID_TOKEN", "Invalid token audience", false);
        }
      }

      // Validate expiration
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp !== undefined) {
        if (now > payload.exp + this.config.clockTolerance) {
          throw createAuthFailure("TOKEN_EXPIRED", "Token has expired", true);
        }
      }

      // Validate not-before
      if (payload.nbf !== undefined) {
        if (now < payload.nbf - this.config.clockTolerance) {
          throw createAuthFailure("INVALID_TOKEN", "Token not yet valid", true);
        }
      }

      // Extract user info
      const userId = payload.userId ?? payload.sub;
      if (!userId) {
        throw createAuthFailure("INVALID_TOKEN", "Token missing user identifier", false);
      }

      return {
        userId,
        role: this.normalizeRole(payload.role),
        allowedDocIds: payload.docIds,
        teamId: payload.teamId,
        exp: payload.exp ? payload.exp * 1000 : undefined,
      };
    } catch (error) {
      // Re-throw auth failures
      if (typeof error === "object" && error !== null && "code" in error) {
        throw error;
      }
      // Wrap unknown errors
      throw createAuthFailure(
        "UNKNOWN",
        error instanceof Error ? error.message : "Token validation failed",
        false
      );
    }
  }

  /**
   * Parse and verify a JWT token with cryptographic signature verification.
   */
  private async parseAndVerifyJwt(token: string): Promise<JwtPayload> {
    // Split token
    const parts = token.split(".");
    if (parts.length !== 3) {
      throw createAuthFailure("INVALID_TOKEN", "Invalid JWT format", false);
    }

    const [headerB64, payloadB64, signatureB64] = parts;

    // Parse header
    const header = this.decodeBase64Url(headerB64);
    let headerObj: { alg?: string; typ?: string };
    try {
      headerObj = JSON.parse(header);
    } catch {
      throw createAuthFailure("INVALID_TOKEN", "Failed to parse JWT header", false);
    }

    // Verify algorithm matches
    if (headerObj.alg !== this.config.algorithm) {
      throw createAuthFailure(
        "INVALID_TOKEN",
        `Algorithm mismatch: expected ${this.config.algorithm}, got ${headerObj.alg}`,
        false
      );
    }

    // Parse payload
    let payload: JwtPayload;
    try {
      const payloadJson = this.decodeBase64Url(payloadB64);
      payload = JSON.parse(payloadJson) as JwtPayload;
    } catch {
      throw createAuthFailure("INVALID_TOKEN", "Failed to parse JWT payload", false);
    }

    // Verify signature (unless in development mode)
    if (!this.config.skipVerification) {
      await this.keyInitPromise; // Ensure key is initialized

      if (!this.cryptoKey) {
        throw createAuthFailure("UNKNOWN", "Crypto key not initialized", false);
      }

      const signatureValid = await this.verifySignature(`${headerB64}.${payloadB64}`, signatureB64);

      if (!signatureValid) {
        throw createAuthFailure("INVALID_TOKEN", "Invalid JWT signature", false);
      }
    }

    return payload;
  }

  /**
   * Verify JWT signature using Web Crypto API.
   */
  private async verifySignature(data: string, signatureB64: string): Promise<boolean> {
    if (!this.cryptoKey) {
      return false;
    }

    try {
      const encoder = new TextEncoder();
      const dataBytes = new Uint8Array(encoder.encode(data)) as Uint8Array<ArrayBuffer>;
      const signature = new Uint8Array(
        this.base64UrlToBytes(signatureB64)
      ) as Uint8Array<ArrayBuffer>;

      const algorithm = this.getWebCryptoAlgorithm();

      return await crypto.subtle.verify(
        this.isEcAlgorithm(this.config.algorithm)
          ? { name: "ECDSA", hash: algorithm.hash }
          : algorithm,
        this.cryptoKey,
        signature,
        dataBytes
      );
    } catch (error) {
      console.error("[JwtSessionAuthProvider] Signature verification error:", error);
      return false;
    }
  }

  /**
   * Decode base64url string to UTF-8 string.
   */
  private decodeBase64Url(str: string): string {
    // Convert base64url to base64
    let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
    // Pad with = if needed
    while (base64.length % 4) {
      base64 += "=";
    }

    // Decode - use Buffer in Node, atob in browser
    if (typeof Buffer !== "undefined") {
      return Buffer.from(base64, "base64").toString("utf-8");
    }
    return atob(base64);
  }

  /**
   * Convert base64url to Uint8Array.
   */
  private base64UrlToBytes(str: string): Uint8Array {
    let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) {
      base64 += "=";
    }

    if (typeof Buffer !== "undefined") {
      return new Uint8Array(Buffer.from(base64, "base64"));
    }

    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  /**
   * Prepare key data for crypto import.
   */
  private prepareKeyData(): Uint8Array {
    const secret = this.config.secret;

    if (this.isHmacAlgorithm(this.config.algorithm)) {
      // HMAC: use raw secret bytes
      return new TextEncoder().encode(secret);
    }

    // RSA/EC: parse PEM to DER
    const pemBody = secret
      .replace(/-----BEGIN.*?-----/g, "")
      .replace(/-----END.*?-----/g, "")
      .replace(/\s/g, "");

    return this.base64UrlToBytes(pemBody);
  }

  /**
   * Get Web Crypto algorithm parameters.
   */
  private getWebCryptoAlgorithm(): { name: string; hash: string } {
    const algo = this.config.algorithm;

    if (algo === "HS256" || algo === "RS256" || algo === "ES256") {
      return { name: this.isHmacAlgorithm(algo) ? "HMAC" : "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
    }
    if (algo === "HS384" || algo === "RS384" || algo === "ES384") {
      return { name: this.isHmacAlgorithm(algo) ? "HMAC" : "RSASSA-PKCS1-v1_5", hash: "SHA-384" };
    }
    if (algo === "HS512" || algo === "RS512" || algo === "ES512") {
      return { name: this.isHmacAlgorithm(algo) ? "HMAC" : "RSASSA-PKCS1-v1_5", hash: "SHA-512" };
    }

    return { name: "HMAC", hash: "SHA-256" };
  }

  /**
   * Get EC curve name.
   */
  private getEcCurve(algo: JwtAlgorithm): string {
    if (algo === "ES256") {
      return "P-256";
    }
    if (algo === "ES384") {
      return "P-384";
    }
    if (algo === "ES512") {
      return "P-521"; // Note: ES512 uses P-521
    }
    return "P-256";
  }

  private isHmacAlgorithm(algo: JwtAlgorithm): boolean {
    return algo.startsWith("HS");
  }

  private isRsaAlgorithm(algo: JwtAlgorithm): boolean {
    return algo.startsWith("RS");
  }

  private isEcAlgorithm(algo: JwtAlgorithm): boolean {
    return algo.startsWith("ES");
  }

  /**
   * Create an anonymous session for unauthenticated access.
   */
  private createAnonymousSession(): SessionAuthResult {
    return {
      userId: `anon-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      role: this.config.anonymousRole,
    };
  }

  /**
   * Normalize role string to valid AuthRole.
   */
  private normalizeRole(role: unknown): AuthRole {
    if (role === "admin") {
      return "admin";
    }
    if (role === "editor") {
      return "editor";
    }
    return "viewer"; // Default to viewer for safety
  }
}

/**
 * Create a development-only HMAC token provider.
 * For testing purposes only - uses simple HMAC signing.
 */
export class DevHmacAuthProvider implements SessionAuthProvider {
  private secret: string;

  constructor(secret: string) {
    this.secret = secret;
  }

  async validate(token: string): Promise<SessionAuthResult> {
    // Simple format: userId:role:signature
    const parts = token.split(":");
    if (parts.length < 3) {
      throw createAuthFailure("INVALID_TOKEN", "Invalid dev token format", false);
    }

    const [userId, role, signature] = parts;

    // Verify signature (simple hash check)
    const expectedSig = this.sign(`${userId}:${role}`);
    if (signature !== expectedSig) {
      throw createAuthFailure("INVALID_TOKEN", "Invalid signature", false);
    }

    return {
      userId,
      role: role as AuthRole,
    };
  }

  /**
   * Generate a dev token for testing.
   */
  generateToken(userId: string, role: AuthRole): string {
    const signature = this.sign(`${userId}:${role}`);
    return `${userId}:${role}:${signature}`;
  }

  private sign(data: string): string {
    // Simple hash for dev - NOT secure for production!
    let hash = 0;
    const combined = data + this.secret;
    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i);
      hash = ((hash << 5) - hash + char) | 0;
    }
    return Math.abs(hash).toString(36);
  }
}
