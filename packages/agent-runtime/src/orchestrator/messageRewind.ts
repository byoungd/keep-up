/**
 * Message Rewind Utilities
 *
 * Provides deterministic cleanup of summary and truncation markers during rewinds.
 */

import type { AgentMessage, MCPToolResult, ToolContent } from "../types";
import type { MessageCompressor } from "./messageCompression";

export interface MessageRewindOptions {
  /** Whether to include the target index in the kept set. */
  includeTarget?: boolean;
  /** Skip cleanup of summary/truncation markers. */
  skipCleanup?: boolean;
}

export interface MessageRewindResult {
  messages: AgentMessage[];
  removedCount: number;
  removedSummaries: number;
  removedTruncationMarkers: number;
}

const SUMMARY_PREFIX = "[Conversation Summary]";
const TRUNCATION_MARKER_REGEX = /\[Content truncated|\[truncated\]/i;

export class MessageRewindManager {
  constructor(private readonly compressor?: MessageCompressor) {}

  rewindToIndex(
    messages: AgentMessage[],
    toIndex: number,
    options: MessageRewindOptions = {}
  ): MessageRewindResult {
    const cutoff = options.includeTarget ? toIndex + 1 : toIndex;
    const bounded = Math.max(0, Math.min(messages.length, cutoff));
    const sliced = messages.slice(0, bounded);

    const cleaned = options.skipCleanup
      ? { messages: sliced, removedSummaries: 0, removedTruncationMarkers: 0 }
      : this.cleanupMessages(sliced);

    this.compressor?.clearCache();

    return {
      messages: cleaned.messages,
      removedCount: messages.length - cleaned.messages.length,
      removedSummaries: cleaned.removedSummaries,
      removedTruncationMarkers: cleaned.removedTruncationMarkers,
    };
  }

  cleanupMessages(messages: AgentMessage[]): {
    messages: AgentMessage[];
    removedSummaries: number;
    removedTruncationMarkers: number;
  } {
    const cleaned: AgentMessage[] = [];
    let removedSummaries = 0;
    let removedTruncationMarkers = 0;

    for (const message of messages) {
      if (isSummaryMessage(message)) {
        removedSummaries += 1;
        continue;
      }

      if (message.role === "tool") {
        const { result, removed } = scrubToolResult(message.result);
        if (removed) {
          removedTruncationMarkers += 1;
          cleaned.push({ ...message, result });
          continue;
        }
        cleaned.push(message);
        continue;
      }

      const { text, removed } = stripTruncationMarkers(message.content);
      if (removed) {
        removedTruncationMarkers += 1;
        cleaned.push({ ...message, content: text });
        continue;
      }

      cleaned.push(message);
    }

    return { messages: cleaned, removedSummaries, removedTruncationMarkers };
  }
}

function isSummaryMessage(message: AgentMessage): boolean {
  return message.role === "system" && message.content.trim().startsWith(SUMMARY_PREFIX);
}

function stripTruncationMarkers(text: string): { text: string; removed: boolean } {
  if (!TRUNCATION_MARKER_REGEX.test(text)) {
    return { text, removed: false };
  }

  const lines = text.split("\n");
  const filtered = lines.filter((line) => !TRUNCATION_MARKER_REGEX.test(line));
  const cleaned = filtered.join("\n").trimEnd();
  return { text: cleaned, removed: true };
}

function scrubToolResult(result: MCPToolResult): { result: MCPToolResult; removed: boolean } {
  let removed = false;
  const content: ToolContent[] = result.content.map((item) => {
    if (item.type !== "text") {
      return item;
    }

    const { text, removed: markerRemoved } = stripTruncationMarkers(item.text);
    if (!markerRemoved) {
      return item;
    }
    removed = true;
    return { ...item, text };
  });

  if (!removed) {
    return { result, removed: false };
  }

  return { result: { ...result, content }, removed: true };
}
