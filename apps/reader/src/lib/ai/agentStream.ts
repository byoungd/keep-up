import type { MCPToolResult } from "@ku0/agent-runtime";

type AgentBaseEventType =
  | "turn:start"
  | "turn:end"
  | "thinking"
  | "plan:created"
  | "plan:refined"
  | "plan:approved"
  | "plan:rejected"
  | "plan:executing"
  | "error";

export type AgentStreamEvent =
  | {
      type: AgentBaseEventType;
      timestamp: number;
      turn: number;
      data: unknown;
    }
  | {
      type: "tool:calling";
      timestamp: number;
      turn: number;
      data: { toolName: string; arguments: Record<string, unknown> };
    }
  | {
      type: "tool:result";
      timestamp: number;
      turn: number;
      data: { toolName: string; result: MCPToolResult };
    }
  | {
      type: "confirmation:required";
      timestamp: number;
      turn: number;
      data: {
        toolName: string;
        description: string;
        arguments: Record<string, unknown>;
        risk: "low" | "medium" | "high";
        reason?: string;
        riskTags?: string[];
        confirmation_id?: string;
      };
    }
  | {
      type: "confirmation:received";
      timestamp: number;
      turn: number;
      data: { confirmed: boolean; confirmation_id?: string };
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseAgentStreamEvent(payload: string): AgentStreamEvent | null {
  if (!payload) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return null;
  }

  if (!isRecord(parsed) || !("event" in parsed)) {
    return null;
  }

  const event = (parsed as { event?: unknown }).event;
  if (!isRecord(event) || typeof event.type !== "string") {
    return null;
  }

  return event as AgentStreamEvent;
}
