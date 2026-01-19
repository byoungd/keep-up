/**
 * Message Compressor Tests
 */

import { describe, expect, it } from "vitest";

import type { AgentMessage } from "../../types";
import { MessageCompressor } from "../messageCompression";

describe("MessageCompressor", () => {
  it("uses incremental compression when messages append within limits", () => {
    let tokenCalls = 0;
    const compressor = new MessageCompressor({
      maxTokens: 1000,
      estimateTokens: (text) => {
        tokenCalls++;
        return text.length;
      },
    });

    const messages: AgentMessage[] = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
    ];

    const first = compressor.compress(messages);
    expect(first.compressionRatio).toBe(0);
    const callsAfterFirst = tokenCalls;

    messages.push({ role: "user", content: "another" });
    const second = compressor.compress(messages);

    expect(second.compressionRatio).toBe(0);
    expect(tokenCalls - callsAfterFirst).toBe(1);
  });

  it("avoids re-tokenizing unchanged messages", () => {
    let tokenCalls = 0;
    const compressor = new MessageCompressor({
      maxTokens: 1000,
      estimateTokens: (text) => {
        tokenCalls++;
        return text.length;
      },
    });

    const messages: AgentMessage[] = [
      { role: "user", content: "alpha" },
      { role: "assistant", content: "beta" },
    ];

    compressor.compress(messages);
    const callsAfterFirst = tokenCalls;
    compressor.compress(messages);

    expect(tokenCalls).toBe(callsAfterFirst);
  });
});
