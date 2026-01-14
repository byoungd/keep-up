/**
 * LFCC v0.9 RC - JWT Authentication Adapter
 *
 * Validates JWT tokens on WebSocket connections.
 * Implements AuthAdapter interface from @ku0/core.
 */

import type { AuthAdapter, AuthContext, AuthResult } from "@ku0/core/security";
import jwt from "jsonwebtoken";

/** JWT payload structure */
export interface JwtPayload {
  /** User ID */
  sub: string;
  /** Document ID (optional, for document-scoped tokens) */
  docId?: string;
  /** User role */
  role?: "viewer" | "editor" | "admin";
  /** Token expiration (Unix timestamp) */
  exp?: number;
  /** Token issued at (Unix timestamp) */
  iat?: number;
}

/** JWT authentication configuration */
export interface JwtAuthConfig {
  /** JWT secret or public key */
  secret: string;
  /** Allowed algorithms (default: ["HS256"]) */
  algorithms?: jwt.Algorithm[];
  /** Whether to allow missing tokens (dev mode) */
  allowMissingToken?: boolean;
}

/**
 * JWT-based authentication adapter.
 * Validates tokens and extracts user identity.
 */
export class JwtAuthAdapter implements AuthAdapter {
  private secret: string;
  private algorithms: jwt.Algorithm[];
  private allowMissingToken: boolean;

  constructor(config: JwtAuthConfig) {
    this.secret = config.secret;
    this.algorithms = config.algorithms ?? ["HS256"];
    this.allowMissingToken = config.allowMissingToken ?? false;
  }

  /**
   * Authenticate a connection request.
   * Validates the JWT token and extracts user info.
   */
  async authenticate(context: AuthContext): Promise<AuthResult> {
    const token = context.token;

    // Handle missing token
    if (!token) {
      if (this.allowMissingToken) {
        return {
          authenticated: true,
          userId: `anonymous-${context.clientId}`,
          role: "viewer",
        };
      }
      return { authenticated: false, reason: "Missing authentication token" };
    }

    try {
      // Verify and decode token
      const decoded = jwt.verify(token, this.secret, {
        algorithms: this.algorithms,
      }) as JwtPayload;

      // Check document scope if present
      if (decoded.docId && decoded.docId !== context.docId) {
        return {
          authenticated: false,
          reason: `Token not valid for document ${context.docId}`,
        };
      }

      return {
        authenticated: true,
        userId: decoded.sub,
        role: decoded.role ?? "viewer",
      };
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        return { authenticated: false, reason: "Token expired" };
      }
      if (error instanceof jwt.JsonWebTokenError) {
        return { authenticated: false, reason: "Invalid token" };
      }
      return { authenticated: false, reason: "Authentication failed" };
    }
  }

  /**
   * Check if user has permission for an action.
   * Role hierarchy: admin > editor > viewer
   */
  async authorize(context: AuthContext, action: "read" | "write" | "admin"): Promise<boolean> {
    // Re-authenticate to get current role
    const auth = await this.authenticate(context);
    if (!auth.authenticated) {
      return false;
    }

    switch (action) {
      case "read":
        return true; // Any authenticated user can read
      case "write":
        return auth.role === "editor" || auth.role === "admin";
      case "admin":
        return auth.role === "admin";
      default:
        return false;
    }
  }

  /**
   * Generate a test token (for development/testing only).
   */
  static generateTestToken(
    secret: string,
    payload: Omit<JwtPayload, "iat">,
    expiresInSeconds = 3600
  ): string {
    return jwt.sign(payload, secret, { expiresIn: expiresInSeconds });
  }
}
