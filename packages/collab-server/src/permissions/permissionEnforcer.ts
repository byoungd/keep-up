/**
 * Collaboration Permissions - Permission Enforcer
 *
 * Tracks client sessions and enforces role-based permissions.
 * Server-side enforcement is the source of truth for access control.
 */

import type { ErrorCode, Role } from "./types";

/** Client session information */
export type ClientSession = {
  /** Unique connection identifier */
  connectionId: string;
  /** User identifier */
  userId: string;
  /** User role */
  role: Role;
  /** Document being accessed */
  docId: string;
  /** Timestamp when session started */
  joinedAt: number;
};

/** Permission check result - allowed */
export type EnforcementResultAllowed = {
  allowed: true;
};

/** Permission check result - denied */
export type EnforcementResultDenied = {
  allowed: false;
  error: ErrorCode;
};

/** Discriminated union for enforcement result */
export type EnforcementResult = EnforcementResultAllowed | EnforcementResultDenied;

/**
 * Permission enforcer for collaboration sessions.
 *
 * Tracks active sessions and enforces role-based access control:
 * - Editors can send CRDT_UPDATE messages
 * - Viewers can only receive updates, not send them
 */
export class PermissionEnforcer {
  /** Map of connectionId -> session */
  private sessions = new Map<string, ClientSession>();

  /**
   * Register a new client session.
   */
  registerSession(session: ClientSession): void {
    this.sessions.set(session.connectionId, session);
  }

  /**
   * Unregister a client session.
   * @returns The removed session, or undefined if not found
   */
  unregisterSession(connectionId: string): ClientSession | undefined {
    const session = this.sessions.get(connectionId);
    this.sessions.delete(connectionId);
    return session;
  }

  /**
   * Get a client session by connection ID.
   */
  getSession(connectionId: string): ClientSession | undefined {
    return this.sessions.get(connectionId);
  }

  /**
   * Get all sessions for a document.
   */
  getSessionsByDoc(docId: string): ClientSession[] {
    return Array.from(this.sessions.values()).filter((s) => s.docId === docId);
  }

  /**
   * Get all active sessions.
   */
  getAllSessions(): ClientSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get the number of active sessions.
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Check if a client has permission to perform an action.
   *
   * Permission rules:
   * - CRDT_UPDATE: only editors can send
   * - JOIN, LEAVE, PRESENCE: all roles can send
   *
   * @param connectionId - The connection to check
   * @param messageType - The type of message being sent
   * @returns Enforcement result
   */
  checkPermission(connectionId: string, messageType: string): EnforcementResult {
    const session = this.sessions.get(connectionId);

    if (!session) {
      return { allowed: false, error: "UNKNOWN" };
    }

    // Only CRDT_UPDATE requires editor role
    if (messageType === "CRDT_UPDATE" && session.role === "viewer") {
      return { allowed: false, error: "PERMISSION_DENIED" };
    }

    return { allowed: true };
  }

  /**
   * Check if a role can perform an action.
   * Useful for checking permissions without a session.
   */
  static canRolePerform(role: Role, messageType: string): boolean {
    if (messageType === "CRDT_UPDATE") {
      return role === "editor";
    }
    return true;
  }

  /**
   * Clear all sessions.
   */
  clear(): void {
    this.sessions.clear();
  }
}
