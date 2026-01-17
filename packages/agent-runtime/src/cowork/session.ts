/**
 * Cowork Session Manager
 *
 * Tracks Cowork sessions and computes sandbox path layout.
 */

import { randomUUID } from "node:crypto";
import * as path from "node:path";
import type { CoworkMode, CoworkPlatform, CoworkSession } from "./types";

export interface CoworkSessionPaths {
  sessionRoot: string;
  mountRoot: string;
  outputsRoot: string;
  uploadsRoot: string;
}

export interface CoworkSessionRecord {
  session: CoworkSession;
  paths: CoworkSessionPaths;
}

export interface CoworkSessionSeed {
  userId: string;
  deviceId: string;
  grants: CoworkSession["grants"];
  connectors: CoworkSession["connectors"];
  sessionId?: string;
  expiresAt?: number;
}

export interface CoworkSessionManagerConfig {
  baseSessionDir?: string;
  mountDirName?: string;
  outputsDirName?: string;
  uploadsDirName?: string;
  platform?: CoworkPlatform;
  mode?: CoworkMode;
}

export class CoworkSessionManager {
  private readonly records = new Map<string, CoworkSessionRecord>();
  private readonly config: Required<CoworkSessionManagerConfig>;

  constructor(config: CoworkSessionManagerConfig = {}) {
    this.config = {
      baseSessionDir: config.baseSessionDir ?? "/sessions",
      mountDirName: config.mountDirName ?? "mnt",
      outputsDirName: config.outputsDirName ?? "outputs",
      uploadsDirName: config.uploadsDirName ?? "uploads",
      platform: config.platform ?? "macos",
      mode: config.mode ?? "cowork",
    };
  }

  createSession(seed: CoworkSessionSeed): CoworkSessionRecord {
    const sessionId = seed.sessionId ?? randomUUID();
    const session: CoworkSession = {
      sessionId,
      userId: seed.userId,
      deviceId: seed.deviceId,
      platform: this.config.platform,
      mode: this.config.mode,
      grants: seed.grants,
      connectors: seed.connectors,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      expiresAt: seed.expiresAt,
    };

    const paths = this.computePaths(sessionId);
    const record: CoworkSessionRecord = { session, paths };
    this.records.set(sessionId, record);
    return record;
  }

  getSession(sessionId: string): CoworkSession | undefined {
    return this.records.get(sessionId)?.session;
  }

  getSessionRecord(sessionId: string): CoworkSessionRecord | undefined {
    return this.records.get(sessionId);
  }

  listSessions(): CoworkSession[] {
    return Array.from(this.records.values()).map((record) => record.session);
  }

  endSession(sessionId: string): boolean {
    return this.records.delete(sessionId);
  }

  getSessionPaths(sessionId: string): CoworkSessionPaths | undefined {
    return this.records.get(sessionId)?.paths;
  }

  private computePaths(sessionId: string): CoworkSessionPaths {
    const sessionRoot = path.resolve(this.config.baseSessionDir, sessionId);
    const mountRoot = path.join(sessionRoot, this.config.mountDirName);
    const outputsRoot = path.join(mountRoot, this.config.outputsDirName);
    const uploadsRoot = path.join(mountRoot, this.config.uploadsDirName);

    return { sessionRoot, mountRoot, outputsRoot, uploadsRoot };
  }
}
