/**
 * Message Compressor Tests
 */

import type { CompressedContext } from "@ku0/tokenizer-rs";
import { describe, expect, it, vi } from "vitest";
import type { AgentMessage } from "../../types";
import { MessageCompressor } from "../messageCompression";

const mockedTokenCounter = vi.hoisted(() => ({
  countTokens: vi.fn((text: string) => text.length),
  estimateJsonTokens: vi.fn((value: unknown) => JSON.stringify(value).length),
  tryCompressContext: vi.fn(() => null as CompressedContext | null),
}));

vi.mock("../../utils/tokenCounter", () => mockedTokenCounter);

describe("MessageCompressor", () => {
  it("prefers native compression when available", () => {
    const nativeContext: CompressedContext = {
      messages: [
        { role: "system", content: "system" },
        { role: "user", content: "keep" },
      ],
      totalTokens: 42,
      removedCount: 1,
      compressionRatio: 0.5,
      selectedIndices: [0, 2],
    };

    mockedTokenCounter.tryCompressContext.mockReturnValueOnce(nativeContext);

    const compressor = new MessageCompressor({
      maxTokens: 5,
      strategy: "truncate",
      preserveCount: 1,
    });

    const messages: AgentMessage[] = [
      { role: "system", content: "system" },
      { role: "user", content: "hello" },
      { role: "assistant", content: "world" },
    ];

    const result = compressor.compress(messages);

    expect(mockedTokenCounter.tryCompressContext).toHaveBeenCalled();
    expect(result.totalTokens).toBe(42);
    expect(result.messages).toEqual([
      { role: "system", content: "system" },
      { role: "user", content: "keep" },
    ]);
  });

  it("falls back when native compression is unavailable", () => {
    mockedTokenCounter.tryCompressContext.mockReturnValueOnce(null);

    const compressor = new MessageCompressor({
      maxTokens: 5,
      strategy: "truncate",
      preserveCount: 1,
    });

    const messages: AgentMessage[] = [
      { role: "system", content: "system" },
      { role: "user", content: "hello" },
      { role: "assistant", content: "world" },
    ];

    const result = compressor.compress(messages);

    expect(mockedTokenCounter.tryCompressContext).toHaveBeenCalled();
    expect(result.messages.length).toBeGreaterThan(0);
    expect(result.totalTokens).toBeGreaterThan(0);
  });

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
