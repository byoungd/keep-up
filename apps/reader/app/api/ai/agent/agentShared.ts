import * as path from "node:path";

import type { AgentMessage, AgentState } from "@keepup/agent-runtime";

export const BASE_SYSTEM_PROMPT = `You are a Cowork AI teammate embedded in Keep-Up Reader.
Work methodically, use tools when needed, and keep responses concise and actionable.
Ask for clarification when the task is ambiguous, and avoid risky actions without user approval.`;

export type AgentHistory = Array<{ role: "user" | "assistant"; content: string }> | undefined;

export function buildSystemPrompt(systemPrompt?: string): string {
  if (!systemPrompt) {
    return BASE_SYSTEM_PROMPT;
  }
  return `${BASE_SYSTEM_PROMPT}\n\n${systemPrompt}`;
}

export function buildInitialState(systemPrompt: string, history: AgentHistory): AgentState {
  const messages: AgentMessage[] = [{ role: "system", content: systemPrompt }];
  if (history) {
    for (const message of history) {
      const content = message.content?.trim();
      if (!content) {
        continue;
      }
      messages.push({ role: message.role, content });
    }
  }
  return {
    turn: 0,
    messages,
    pendingToolCalls: [],
    status: "idle",
  };
}

export function resolveWorkspaceRoot(): string {
  const override = process.env.KEEPUP_WORKSPACE_ROOT;
  if (override) {
    return path.resolve(override);
  }
  return path.resolve(process.cwd());
}
