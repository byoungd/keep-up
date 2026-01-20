import type { AuditLogger, ICheckpointManager } from "../../types";

export interface ShadowCheckpointMetadata {
  commit: string;
  base: string;
  message: string;
  createdAt: number;
}

export interface ShadowCheckpointDiff {
  path: {
    relative: string;
    absolute: string;
  };
  content: {
    before: string;
    after: string;
  };
}

export interface ShadowCheckpointInitResult {
  created: boolean;
  baseHash: string;
}

export interface ShadowCheckpointServiceOptions {
  taskId: string;
  workspacePath: string;
  storagePath: string;
  logger?: Pick<Console, "debug" | "info" | "warn" | "error">;
  auditLogger?: AuditLogger;
}

export interface ShadowCheckpointSaveOptions {
  allowEmpty?: boolean;
  checkpointId?: string;
  checkpointManager?: ICheckpointManager;
}
