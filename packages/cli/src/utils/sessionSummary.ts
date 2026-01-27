import type { AgentState } from "@ku0/agent-runtime-core";
import type { SessionMessage, SessionRecord } from "./sessionStore";

const SUMMARY_PREFIX = "[Conversation Summary]";

export function extractConversationSummary(state: AgentState): string | undefined {
  for (let i = state.messages.length - 1; i >= 0; i -= 1) {
    const message = state.messages[i];
    if (message.role === "system" && message.content.startsWith(SUMMARY_PREFIX)) {
      return message.content;
    }
  }
  return undefined;
}

export function upsertConversationSummary(
  session: SessionRecord,
  summary: string,
  timestamp = Date.now()
): void {
  const summaryMessage: SessionMessage = {
    role: "system",
    content: summary,
    timestamp,
  };
  const existingIndex = session.messages.findIndex(
    (message) => message.role === "system" && message.content.startsWith(SUMMARY_PREFIX)
  );
  if (existingIndex >= 0) {
    session.messages[existingIndex] = summaryMessage;
    return;
  }
  session.messages.push(summaryMessage);
}
