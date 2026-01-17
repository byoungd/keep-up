/**
 * Content extraction utilities for task results and summaries
 */

import type { CoworkTaskSummary } from "@ku0/agent-runtime";
import { isRecord } from "@ku0/shared";

/**
 * Extract task summary from event data
 */
export function extractTaskSummary(
  data: Record<string, unknown> | undefined
): CoworkTaskSummary | null {
  if (!isRecord(data) || !isRecord(data.result)) {
    return null;
  }
  const summary = data.result.summary;
  return isRecord(summary) ? (summary as unknown as CoworkTaskSummary) : null;
}

/**
 * Extract prompt from task event data
 */
export function extractPrompt(data: Record<string, unknown> | undefined): string | undefined {
  if (!isRecord(data) || !isRecord(data.task)) {
    return undefined;
  }
  const payload = data.task.payload;
  return isRecord(payload) && typeof payload.prompt === "string" ? payload.prompt : undefined;
}

/**
 * Extract title from task event data
 */
export function extractTitle(data: Record<string, unknown> | undefined): string | undefined {
  if (!isRecord(data) || !isRecord(data.task)) {
    return undefined;
  }
  return typeof data.task.name === "string" ? data.task.name : undefined;
}

/**
 * Extract result content from completion data
 */
export function extractResultContent(data: Record<string, unknown> | undefined): string | null {
  if (!isRecord(data) || !isRecord(data.result)) {
    return null;
  }
  const result = data.result;

  if (typeof result === "string") {
    return result;
  }
  if (!isRecord(result)) {
    return null;
  }
  if (typeof result.content === "string") {
    return result.content;
  }
  if (typeof result.output === "string") {
    return result.output;
  }
  if (Array.isArray(result.messages)) {
    const content = extractAssistantMessage(result.messages);
    if (content) {
      return content;
    }
  }

  const state = result.state;
  if (!isRecord(state) || !Array.isArray(state.messages)) {
    return null;
  }
  return extractAssistantMessage(state.messages);
}

/**
 * Extract assistant message content from message array
 */
function extractAssistantMessage(messages: unknown[]): string | null {
  const reversed = messages.slice().reverse();
  for (const message of reversed) {
    if (!isRecord(message)) {
      continue;
    }
    if (message.role !== "assistant") {
      continue;
    }
    const content = extractMessageContent(message.content);
    if (content) {
      return content;
    }
  }
  return null;
}

/**
 * Extract text content from various message content formats
 */
function extractMessageContent(content: unknown): string | null {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    const parts = content
      .map((part) => extractMessageContent(part))
      .filter((value): value is string => typeof value === "string" && value.length > 0);
    return parts.length > 0 ? parts.join("") : null;
  }
  if (isRecord(content)) {
    if (typeof content.text === "string") {
      return content.text;
    }
    if (typeof content.content === "string") {
      return content.content;
    }
  }
  return null;
}

/**
 * Extract telemetry metadata from tool result
 */
export function extractTelemetry(
  data: unknown
): { durationMs?: number; attempts?: number } | undefined {
  if (!isRecord(data)) {
    return undefined;
  }
  const result: { durationMs?: number; attempts?: number } = {};

  if (isRecord(data.meta)) {
    if (typeof data.meta.durationMs === "number") {
      result.durationMs = data.meta.durationMs;
    }
    if (typeof data.meta.attempts === "number") {
      result.attempts = data.meta.attempts;
    }
  }

  // Also check nested result meta if orchestrator passed it through
  if (isRecord(data.result) && isRecord(data.result.meta)) {
    if (typeof data.result.meta.durationMs === "number") {
      result.durationMs = data.result.meta.durationMs;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Check if tool result indicates an error
 */
export function isToolError(result: unknown): boolean | undefined {
  if (!isRecord(result)) {
    return undefined;
  }
  if (typeof result.success === "boolean") {
    return !result.success;
  }
  return undefined;
}

/**
 * Extract error code from tool result
 */
export function extractErrorCode(result: unknown): string | undefined {
  if (!isRecord(result)) {
    return undefined;
  }
  if (isRecord(result.error) && typeof result.error.code === "string") {
    return result.error.code;
  }
  return undefined;
}
