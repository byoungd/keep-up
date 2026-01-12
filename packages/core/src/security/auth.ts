/**
 * LFCC v0.9 RC - Track 11: Authentication Adapter
 *
 * Provides pluggable authentication for SyncServer.
 * Default implementation allows all connections (dev mode).
 */

/** Authentication result */
export type AuthResult = {
  /** Whether authentication succeeded */
  authenticated: boolean;
  /** User ID (if authenticated) */
  userId?: string;
  /** User role for this document */
  role?: "viewer" | "editor" | "admin";
  /** Rejection reason (if not authenticated) */
  reason?: string;
};

/** Authentication context for a connection */
export type AuthContext = {
  /** Document ID being accessed */
  docId: string;
  /** Client ID */
  clientId: string;
  /** Authorization token (from handshake) */
  token?: string;
  /** Additional metadata */
  meta?: Record<string, unknown>;
};

/**
 * Authentication adapter interface.
 * Implement this to integrate with your auth system.
 */
export interface AuthAdapter {
  /**
   * Authenticate a connection request.
   * Called during handshake.
   */
  authenticate(context: AuthContext): Promise<AuthResult>;

  /**
   * Check if user has permission for an action.
   * Called for write operations.
   */
  authorize(context: AuthContext, action: "read" | "write" | "admin"): Promise<boolean>;
}

/**
 * Default auth adapter that allows all connections.
 * Use only for development/testing.
 */
export class AllowAllAuthAdapter implements AuthAdapter {
  async authenticate(context: AuthContext): Promise<AuthResult> {
    return {
      authenticated: true,
      userId: context.clientId,
      role: "editor",
    };
  }

  async authorize(_context: AuthContext, _action: "read" | "write" | "admin"): Promise<boolean> {
    return true;
  }
}

/**
 * Token-based auth adapter.
 * Validates JWT or opaque tokens against a verification function.
 */
export type TokenVerifier = (
  token: string,
  docId: string
) => Promise<{ valid: boolean; userId?: string; role?: "viewer" | "editor" | "admin" }>;

export class TokenAuthAdapter implements AuthAdapter {
  private verifier: TokenVerifier;

  constructor(verifier: TokenVerifier) {
    this.verifier = verifier;
  }

  async authenticate(context: AuthContext): Promise<AuthResult> {
    if (!context.token) {
      return { authenticated: false, reason: "Missing token" };
    }

    const result = await this.verifier(context.token, context.docId);
    if (!result.valid) {
      return { authenticated: false, reason: "Invalid token" };
    }

    return {
      authenticated: true,
      userId: result.userId,
      role: result.role ?? "viewer",
    };
  }

  async authorize(context: AuthContext, action: "read" | "write" | "admin"): Promise<boolean> {
    // Re-authenticate to get role
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
}

/** Create default (allow-all) auth adapter */
export function createDefaultAuthAdapter(): AuthAdapter {
  return new AllowAllAuthAdapter();
}
