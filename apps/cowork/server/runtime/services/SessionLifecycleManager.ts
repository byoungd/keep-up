/**
 * Session lifecycle manager service
 * Handles session creation, updates, and metadata management
 */

import type { CoworkSession } from "@ku0/agent-runtime";
import type { SessionStoreLike } from "../../storage/contracts";

export class SessionLifecycleManager {
  constructor(private readonly sessionStore: SessionStoreLike) {}

  /**
   * Touch session to update last modified timestamp
   */
  async touchSession(sessionId: string): Promise<void> {
    await this.sessionStore.update(sessionId, (s: CoworkSession) => s);
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId: string): Promise<CoworkSession | null> {
    return await this.sessionStore.getById(sessionId);
  }

  /**
   * Update session data
   */
  async updateSession(
    sessionId: string,
    updater: (session: CoworkSession) => CoworkSession
  ): Promise<CoworkSession | null> {
    return await this.sessionStore.update(sessionId, updater);
  }

  /**
   * Create new session
   */
  async createSession(session: CoworkSession): Promise<CoworkSession> {
    return await this.sessionStore.create(session);
  }

  /**
   * Delete session
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    return await this.sessionStore.delete(sessionId);
  }

  /**
   * Get all sessions
   */
  async getAllSessions(): Promise<CoworkSession[]> {
    return await this.sessionStore.getAll();
  }
}
