/**
 * Cowork Runtime Types
 *
 * Core types for Cowork sessions, grants, tasks, and summaries.
 */

import type { AgentMode } from "../modes";

export type CoworkPlatform = "macos";
export type CoworkMode = "cowork";

export interface CoworkSession {
  sessionId: string;
  userId: string;
  deviceId: string;
  platform: CoworkPlatform;
  mode: CoworkMode;
  grants: CoworkFolderGrant[];
  connectors: CoworkConnectorGrant[];
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;
  endedAt?: number;
  title?: string;
  projectId?: string;
  /** Agent mode: 'plan' for read-only analysis, 'build' for full development access */
  agentMode?: AgentMode;
}

export interface CoworkFolderGrant {
  id: string;
  rootPath: string;
  allowWrite: boolean;
  allowDelete: boolean;
  allowCreate: boolean;
  outputRoots?: string[];
}

export interface CoworkConnectorGrant {
  id: string;
  provider: string;
  scopes: string[];
  allowActions: boolean;
}

export type CoworkTaskStatus =
  | "queued"
  | "planning"
  | "ready"
  | "running"
  | "awaiting_confirmation"
  | "completed"
  | "failed"
  | "cancelled";

export interface CoworkTask {
  taskId: string;
  sessionId: string;
  title: string;
  prompt: string;
  status: CoworkTaskStatus;
  modelId?: string;
  providerId?: string;
  fallbackNotice?: string;
  plan?: CoworkTaskPlan;
  createdAt: number;
  updatedAt: number;
}

export interface CoworkTaskPlan {
  planId: string;
  steps: CoworkPlanStep[];
  dependencies: CoworkPlanDependency[];
  riskTags: CoworkRiskTag[];
  estimatedActions: string[];
}

export interface CoworkPlanStep {
  stepId: string;
  title: string;
  description: string;
  requiresConfirmation: boolean;
}

export interface CoworkPlanDependency {
  stepId: string;
  dependsOn: string[];
}

export type CoworkRiskTag = "delete" | "overwrite" | "network" | "connector" | "batch";

export interface CoworkTaskSummary {
  taskId: string;
  outputs: CoworkOutputArtifact[];
  fileChanges: CoworkFileChange[];
  actionLog: CoworkActionLogEntry[];
  followups: string[];
}

export interface CoworkOutputArtifact {
  path: string;
  kind: "document" | "spreadsheet" | "image" | "other";
}

export interface CoworkFileChange {
  path: string;
  change: "create" | "update" | "delete" | "rename" | "move";
}

export interface CoworkActionLogEntry {
  timestamp: number;
  action: string;
  details: string;
}

export interface CoworkProject {
  projectId: string;
  name: string;
  description?: string;
  pathHint?: string;
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}
