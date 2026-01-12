/**
 * NextAuth Session Token Provider
 *
 * Production-ready provider for validating NextAuth session tokens.
 * Supports both JWT and database session strategies.
 */

import jwt from "jsonwebtoken";
import {
  type AuthRole,
  type SessionAuthProvider,
  type SessionAuthResult,
  createAuthFailure,
} from "./sessionAuthProvider";

/** NextAuth provider configuration */
export interface NextAuthProviderConfig {
  /** JWT secret (NEXTAUTH_SECRET) */
  secret: string;
  /** Session max age in seconds (default: 30 days) */
  maxAge?: number;
  /** Clock tolerance in seconds (default: 60) */
  clockTolerance?: number;
  /** Allow anonymous access */
  allowAnonymous?: boolean;
  /** Default role for authenticated users */
  defaultRole?: AuthRole;
  /** Custom role extraction from token */
  extractRole?: (payload: NextAuthJwtPayload) => AuthRole;
  /** Custom document access check */
  checkDocumentAccess?: (payload: NextAuthJwtPayload, docId?: string) => boolean;
}

/** NextAuth JWT payload structure */
export interface NextAuthJwtPayload {
  /** User ID (from sub claim) */
  sub?: string;
  /** User name */
  name?: string;
  /** User email */
  email?: string;
  /** User image */
  picture?: string;
  /** Custom role claim */
  role?: AuthRole;
  /** Team ID */
  teamId?: string;
  /** Allowed document IDs */
  docIds?: string[];
  /** Token issued at */
  iat?: number;
  /** Token expiration */
  exp?: number;
  /** Token not before */
  nbf?: number;
  /** JWT ID */
  jti?: string;
}

/**
 * NextAuth Session Token Provider
 *
 * Validates NextAuth session tokens (JWT strategy) and extracts user information.
 * Compatible with NextAuth v4 and v5 (Auth.js).
 */
export class NextAuthProvider implements SessionAuthProvider {
  private config: Required<
    Pick<
      NextAuthProviderConfig,
      "secret" | "maxAge" | "clockTolerance" | "allowAnonymous" | "defaultRole"
    >
  > &
    Partial<NextAuthProviderConfig>;

  constructor(config: NextAuthProviderConfig) {
    this.config = {
      secret: config.secret,
      maxAge: config.maxAge ?? 30 * 24 * 60 * 60, // 30 days
      clockTolerance: config.clockTolerance ?? 60,
      allowAnonymous: config.allowAnonymous ?? false,
      defaultRole: config.defaultRole ?? "viewer",
      extractRole: config.extractRole,
      checkDocumentAccess: config.checkDocumentAccess,
    };
  }

  async validate(token: string): Promise<SessionAuthResult> {
    const missingResult = this.handleMissingToken(token);
    if (missingResult) {
      return missingResult;
    }

    try {
      const payload = this.verifyToken(token);
      const userId = this.resolveUserId(payload);
      const role = this.resolveRole(payload);
      return this.buildSessionResult(payload, userId, role);
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  private handleMissingToken(token: string | undefined): SessionAuthResult | null {
    if (token && token.length > 0) {
      return null;
    }
    if (this.config.allowAnonymous) {
      return this.createAnonymousSession();
    }
    throw createAuthFailure("MISSING_TOKEN", "Authentication token required", true);
  }

  private verifyToken(token: string): NextAuthJwtPayload {
    return jwt.verify(token, this.config.secret, {
      algorithms: ["HS256", "HS384", "HS512"],
      clockTolerance: this.config.clockTolerance,
      maxAge: `${this.config.maxAge}s`,
    }) as NextAuthJwtPayload;
  }

  private resolveUserId(payload: NextAuthJwtPayload): string {
    const userId = payload.sub ?? payload.email;
    if (!userId) {
      throw createAuthFailure("INVALID_TOKEN", "Token missing user identifier", false);
    }
    return userId;
  }

  private resolveRole(payload: NextAuthJwtPayload): AuthRole {
    if (this.config.extractRole) {
      return this.config.extractRole(payload);
    }
    return payload.role ?? this.config.defaultRole;
  }

  private buildSessionResult(
    payload: NextAuthJwtPayload,
    userId: string,
    role: AuthRole
  ): SessionAuthResult {
    return {
      userId,
      role,
      allowedDocIds: payload.docIds,
      teamId: payload.teamId,
      exp: payload.exp ? payload.exp * 1000 : undefined,
      metadata: {
        name: payload.name,
        email: payload.email,
        picture: payload.picture,
      },
    };
  }

  private normalizeError(error: unknown): never {
    if (error instanceof jwt.TokenExpiredError) {
      throw createAuthFailure("TOKEN_EXPIRED", "Session has expired", true);
    }
    if (error instanceof jwt.NotBeforeError) {
      throw createAuthFailure("INVALID_TOKEN", "Token not yet valid", true);
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw createAuthFailure("INVALID_TOKEN", "Invalid session token", false);
    }
    if (typeof error === "object" && error !== null && "code" in error) {
      throw error;
    }
    throw createAuthFailure(
      "UNKNOWN",
      error instanceof Error ? error.message : "Token validation failed",
      false
    );
  }

  /**
   * Check if a token has been revoked.
   * Override this method to implement token revocation.
   */
  async isRevoked(_token: string): Promise<boolean> {
    // Default implementation: no revocation check
    // Override to check against a blacklist or revocation service
    return false;
  }

  /**
   * Create an anonymous session.
   */
  private createAnonymousSession(): SessionAuthResult {
    return {
      userId: `anon-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      role: "viewer",
    };
  }

  /**
   * Generate a token for testing purposes.
   * DO NOT use in production - tokens should be issued by NextAuth.
   */
  static generateTestToken(
    secret: string,
    payload: Partial<NextAuthJwtPayload> & { sub: string },
    expiresIn = "1h"
  ): string {
    return jwt.sign(payload, secret, { expiresIn });
  }
}

/**
 * Create a NextAuth provider with environment configuration.
 * Reads NEXTAUTH_SECRET from environment variables.
 */
export function createNextAuthProvider(
  options: Partial<Omit<NextAuthProviderConfig, "secret">> = {}
): NextAuthProvider {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET environment variable is required");
  }

  return new NextAuthProvider({
    secret,
    ...options,
  });
}
