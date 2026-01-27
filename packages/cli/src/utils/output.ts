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

  if (output === "markdown") {
    return formatMarkdownOutput(state, metadata);
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

function formatMarkdownOutput(state: AgentState, metadata: OutputMetadata): string {
  const assistantText = extractAssistantText(state) || "_No assistant response._";
  const toolCalls = metadata.toolCalls ?? [];
  const approvals = metadata.approvals ?? [];

  const lines = ["# Response", "", assistantText, "", "## Metadata"];
  if (metadata.sessionId) {
    lines.push(`- Session: ${metadata.sessionId}`);
  }
  lines.push(`- Tool calls: ${toolCalls.length}`);
  lines.push(`- Approvals: ${approvals.length}`);

  if (toolCalls.length > 0) {
    lines.push("", "## Tool Calls", "```json", JSON.stringify(toolCalls, null, 2), "```");
  }

  if (approvals.length > 0) {
    lines.push("", "## Approvals", "```json", JSON.stringify(approvals, null, 2), "```");
  }

  return lines.join("\n");
}
