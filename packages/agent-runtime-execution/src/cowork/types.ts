/**
 * Cowork Runtime Types
 *
 * Core types for Cowork sessions, grants, tasks, and summaries.
 */

import type { AgentMode } from "../modes";
import type { CoworkSandboxMode, CoworkSessionIsolationLevel, TokenUsageStats } from "../types";
import type { WorkflowContext, WorkflowPhase, WorkflowTemplate } from "../workflows";
import type { CoworkRiskTag } from "./policy";

export type { CoworkRiskTag };

export type CoworkPlatform = "macos";
export type CoworkMode = "cowork";
export type CoworkIsolationLevel = CoworkSessionIsolationLevel;

export interface CoworkSession {
  sessionId: string;
  userId: string;
  deviceId: string;
  platform: CoworkPlatform;
  mode: CoworkMode;
  isolationLevel: CoworkIsolationLevel;
  sandboxMode?: CoworkSandboxMode;
  toolAllowlist?: string[];
  toolDenylist?: string[];
  grants: CoworkFolderGrant[];
  connectors: CoworkConnectorGrant[];
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;
  endedAt?: number;
  title?: string;
  projectId?: string;
  workspaceId?: string;
  /** Agent mode: 'plan' for read-only analysis, 'build' for full development access */
  agentMode?: AgentMode;
  /** Cumulative token usage for this session */
  usage?: TokenUsageStats;
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
  metadata?: Record<string, unknown>;
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

export interface CoworkWorkspace {
  workspaceId: string;
  name: string;
  pathHint?: string;
  createdAt: number;
  lastOpenedAt: number;
  metadata?: Record<string, unknown>;
}

export type CoworkWorkspaceSessionKind = "terminal" | "browser" | "file";

export type CoworkWorkspaceSessionStatus = "created" | "active" | "paused" | "closed";

export type CoworkWorkspaceSessionController = "agent" | "user";

export interface CoworkWorkspaceSession {
  workspaceSessionId: string;
  sessionId: string;
  workspaceId?: string;
  kind: CoworkWorkspaceSessionKind;
  status: CoworkWorkspaceSessionStatus;
  ownerAgentId?: string;
  controller: CoworkWorkspaceSessionController;
  controllerId?: string;
  createdAt: number;
  updatedAt: number;
  endedAt?: number;
  metadata?: Record<string, unknown>;
}

export type CoworkWorkspaceEventKind =
  | "stdout"
  | "stderr"
  | "prompt"
  | "screenshot"
  | "dom_snapshot"
  | "file_view"
  | "log_line"
  | "status";

export type CoworkWorkspaceEventSource = "agent" | "user" | "system";

export interface CoworkWorkspaceEvent {
  eventId: string;
  workspaceSessionId: string;
  sessionId: string;
  sequence: number;
  timestamp: number;
  kind: CoworkWorkspaceEventKind;
  payload: Record<string, unknown>;
  source?: CoworkWorkspaceEventSource;
}

export interface CoworkWorkflowTemplateInput {
  key: string;
  label: string;
  required: boolean;
  placeholder?: string;
}

export interface CoworkWorkflowTemplate {
  templateId: string;
  name: string;
  description: string;
  mode: AgentMode;
  inputs: CoworkWorkflowTemplateInput[];
  prompt: string;
  expectedArtifacts: string[];
  version: string;
  createdAt: number;
  updatedAt: number;
  usageCount?: number;
  lastUsedAt?: number;
  lastUsedInputs?: Record<string, string>;
  lastUsedSessionId?: string;
}

export interface CoworkTokenUsage {
  messageId?: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  modelId: string;
  providerId: string;
  timestamp: number;
}

export interface CoworkSessionCostSummary {
  sessionId: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  messageCount: number;
  byModel: Record<string, CoworkTokenUsage>;
}
export type { WorkflowTemplate, WorkflowContext, WorkflowPhase };
