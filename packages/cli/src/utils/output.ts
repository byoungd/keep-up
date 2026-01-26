import type { AgentMessage, AgentState } from "@ku0/agent-runtime-core";
import type { ApprovalRecord, ToolCallRecord } from "@ku0/tooling-session";

export type OutputFormat = "text" | "json" | "markdown";

export interface OutputMetadata {
  sessionId?: string;
  toolCalls?: ToolCallRecord[];
  approvals?: ApprovalRecord[];
}

export function extractAssistantText(state: AgentState): string {
  const message = findLastAssistantMessage(state.messages);
  return message?.content ?? "";
}

export function formatAgentOutput(
  state: AgentState,
  output: OutputFormat,
  metadata: OutputMetadata = {}
): string {
  if (output === "json") {
    return JSON.stringify(
      {
        sessionId: metadata.sessionId,
        state,
        toolCalls: metadata.toolCalls ?? [],
        approvals: metadata.approvals ?? [],
      },
      null,
      2
    );
  }

  const text = extractAssistantText(state);
  return text || "<no assistant response>";
}

function findLastAssistantMessage(
  messages: AgentMessage[]
): { role: "assistant"; content: string } | undefined {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role === "assistant") {
      return message;
    }
  }
  return undefined;
}
