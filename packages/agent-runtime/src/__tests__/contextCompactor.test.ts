/**
 * Context Compactor Tests
 *
 * Tests for the ContextCompactor threshold-based compression per spec 5.11.
 */

import { describe, expect, it } from "vitest";
import { ContextCompactor, type Message } from "../context/ContextCompactor";

describe("ContextCompactor", () => {
  describe("checkThreshold", () => {
    it("should not require compression below threshold", () => {
      const compactor = new ContextCompactor({
        contextConfig: {
          maxTokens: 10000,
          compressionThreshold: 0.8, // 80%
          preserveLastN: 3,
          compressionStrategy: "hybrid",
        },
      });

      const messages: Message[] = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there!" },
      ];

      const result = compactor.checkThreshold(messages, "You are a helpful assistant.");

      expect(result.needsCompression).toBe(false);
      expect(result.usagePercent).toBeLessThan(0.8);
    });

    it("should require compression at or above threshold", () => {
      const compactor = new ContextCompactor({
        contextConfig: {
          maxTokens: 100, // Very low limit
          compressionThreshold: 0.5, // 50%
          preserveLastN: 2,
          compressionStrategy: "hybrid",
        },
      });

      // Create messages that exceed 50% of 100 tokens
      const longMessage = "This is a long message ".repeat(20);
      const messages: Message[] = [
        { role: "user", content: longMessage },
        { role: "assistant", content: longMessage },
      ];

      const result = compactor.checkThreshold(messages);

      expect(result.needsCompression).toBe(true);
      expect(result.usagePercent).toBeGreaterThanOrEqual(0.5);
    });

    it("should include system prompt in token calculation", () => {
      const compactor = new ContextCompactor({
        contextConfig: {
          maxTokens: 100,
          compressionThreshold: 0.8,
          preserveLastN: 2,
          compressionStrategy: "hybrid",
        },
      });

      const messages: Message[] = [];
      const systemPrompt = "You are a helpful assistant. ".repeat(30);

      const result = compactor.checkThreshold(messages, systemPrompt);

      expect(result.currentTokens).toBeGreaterThan(0);
    });
  });

  describe("getMessagesToPreserve", () => {
    it("should preserve last N user messages and responses", () => {
      const compactor = new ContextCompactor({
        contextConfig: {
          maxTokens: 10000,
          compressionThreshold: 0.8,
          preserveLastN: 2,
          compressionStrategy: "hybrid",
        },
      });

      const messages: Message[] = [
        { role: "user", content: "First question" },
        { role: "assistant", content: "First answer" },
        { role: "user", content: "Second question" },
        { role: "assistant", content: "Second answer" },
        { role: "user", content: "Third question" },
        { role: "assistant", content: "Third answer" },
      ];

      const { preserved, toSummarize } = compactor.getMessagesToPreserve(messages);

      // Should preserve last 2 user messages starting from the second user message
      expect(preserved.length).toBeGreaterThan(0);
      expect(toSummarize.length).toBeLessThan(messages.length);
      expect(preserved[0].role).toBe("user");
    });

    it("should summarize older messages", () => {
      const compactor = new ContextCompactor({
        contextConfig: {
          maxTokens: 10000,
          compressionThreshold: 0.8,
          preserveLastN: 1,
          compressionStrategy: "hybrid",
        },
      });

      const messages: Message[] = [
        { role: "user", content: "Old question" },
        { role: "assistant", content: "Old answer" },
        { role: "user", content: "Recent question" },
        { role: "assistant", content: "Recent answer" },
      ];

      const { preserved, toSummarize } = compactor.getMessagesToPreserve(messages);

      expect(toSummarize.length).toBe(2); // Old Q&A
      expect(preserved.length).toBe(2); // Recent Q&A
    });
  });

  describe("needsCompaction", () => {
    it("should use targetThreshold for compaction check", () => {
      const compactor = new ContextCompactor({
        targetThreshold: 50, // Only 50 tokens threshold
      });

      const shortMessages: Message[] = [{ role: "user", content: "Hi" }];
      expect(compactor.needsCompaction(shortMessages)).toBe(false);

      // 500 A's should definitely exceed 50 tokens
      const longMessages: Message[] = [{ role: "user", content: "A".repeat(500) }];
      expect(compactor.needsCompaction(longMessages)).toBe(true);
    });
  });
});
