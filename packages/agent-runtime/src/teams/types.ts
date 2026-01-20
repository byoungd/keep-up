/**
 * Team Orchestration Types
 *
 * Shared types for team registry and group chat routing.
 */

import type { MessageHandler } from "../types";

export type TeamProcessMode = "sequential" | "round_robin" | "hierarchical";

export type TeamMessageRole = "user" | "assistant" | "system";

export interface TeamParticipant {
  agentId: string;
  displayName: string;
  role?: string;
  capabilities: string[];
  metadata?: Record<string, unknown>;
  handler?: MessageHandler;
}

export interface TeamDefinition {
  teamId: string;
  name: string;
  description?: string;
  participants: TeamParticipant[];
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}

export interface TeamRegistration {
  teamId?: string;
  name: string;
  description?: string;
  participants: TeamParticipant[];
  metadata?: Record<string, unknown>;
}

export interface TeamMessage {
  messageId: string;
  teamId: string;
  from: string;
  role: TeamMessageRole;
  content: string;
  createdAt: number;
  metadata?: Record<string, unknown>;
}

export type TeamChatScope = "group" | "direct";

export interface TeamChatPayload {
  teamId: string;
  scope: TeamChatScope;
  message: TeamMessage;
  to?: string;
}

export interface TeamParticipantMatch {
  teamId: string;
  teamName: string;
  participant: TeamParticipant;
}

export interface TeamCheckpointInfo {
  teamId: string;
  name: string;
  description?: string;
  participants: Array<{
    agentId: string;
    displayName: string;
    role?: string;
    capabilities: string[];
  }>;
  participantCount: number;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  lastMessageAt?: number;
}
