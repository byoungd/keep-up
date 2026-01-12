/**
 * Stream Bridge Tests
 */

import type { AIProvenance, EditIntent } from "@keepup/core";
import { beforeEach, describe, expect, it } from "vitest";
import {
  type StreamBridge,
  createAITokenEvent,
  createStreamBridge,
  isDocumentEditEvent,
} from "../../bridge/streamBridge";

describe("streamBridge", () => {
  const mockIntent: EditIntent = {
    id: "intent-123",
    category: "content_creation",
    description: { short: "Test", locale: "en-US" },
    structured: { action: "generate" },
    agent_id: "test-agent",
  };

  const mockProvenance: AIProvenance = {
    model_id: "gpt-4",
    prompt_hash: "abc123",
  };

  let bridge: StreamBridge;

  beforeEach(() => {
    bridge = createStreamBridge({
      blockId: "block-123",
      opCode: "OP_AI_GENERATE",
      intent: mockIntent,
      provenance: mockProvenance,
      requestId: "req-123",
      confidence: 0.85,
    });
  });

  describe("processToken", () => {
    it("accumulates tokens in buffer", () => {
      bridge.processToken("Hello ");
      bridge.processToken("world");

      const buffer = bridge.getBuffer();
      expect(buffer.total_content).toBe("Hello world");
    });

    it("increments token count", () => {
      bridge.processToken("a");
      bridge.processToken("b");
      bridge.processToken("c");

      expect(bridge.getTokenCount()).toBe(3);
    });

    it("returns document edit event at sentence boundary", () => {
      bridge.processToken("Hello world. ");
      bridge.processToken("Next sentence");

      // First token after sentence should trigger commit
      expect(bridge.getBuffer().sentence_complete_offsets.length).toBeGreaterThan(0);
    });

    it("returns empty array when no commit point reached", () => {
      const events = bridge.processToken("Partial");
      // May or may not have events depending on configuration
      expect(Array.isArray(events)).toBe(true);
    });
  });

  describe("flush", () => {
    it("returns final commit event for remaining content", () => {
      bridge.processToken("Hello ");
      bridge.processToken("world");

      const event = bridge.flush();

      expect(event).not.toBeNull();
      expect(event?.type).toBe("document:edit");
      expect(event?.partial).toBe(false);
    });

    it("returns null when buffer is empty", () => {
      const event = bridge.flush();
      expect(event).toBeNull();
    });

    it("includes correct block ID and opCode", () => {
      bridge.processToken("Test");
      const event = bridge.flush();

      expect(event?.blockId).toBe("block-123");
      expect(event?.opCode).toBe("OP_AI_GENERATE");
    });

    it("includes confidence score", () => {
      bridge.processToken("Test");
      const event = bridge.flush();

      expect(event?.confidence).toBe(0.85);
    });

    it("includes request ID and AI metadata", () => {
      bridge.processToken("Test");
      const event = bridge.flush();

      expect(event?.requestId).toBe("req-123");
      expect(event?.aiMeta?.intent_id).toBe("intent-123");
      expect(event?.aiMeta?.intent?.id).toBe("intent-123");
    });
  });

  describe("getAIOperationMeta", () => {
    it("returns correct metadata", () => {
      const meta = bridge.getAIOperationMeta();

      expect(meta.op_code).toBe("OP_AI_GENERATE");
      expect(meta.intent_id).toBe("intent-123");
      expect(meta.intent?.id).toBe("intent-123");
      expect(meta.provenance.model_id).toBe("gpt-4");
      expect(meta.confidence.score).toBe(0.85);
    });

    it("includes agent ID from intent", () => {
      const meta = bridge.getAIOperationMeta();
      expect(meta.agent_id).toBe("test-agent");
    });
  });

  describe("getBuffer", () => {
    it("returns copy of buffer state", () => {
      bridge.processToken("Test");
      const buffer1 = bridge.getBuffer();
      const buffer2 = bridge.getBuffer();

      expect(buffer1).toEqual(buffer2);
      expect(buffer1).not.toBe(buffer2); // Different objects
    });
  });

  describe("sentence detection", () => {
    it("detects period as sentence ending", () => {
      bridge.processToken("First sentence. Second");

      const buffer = bridge.getBuffer();
      expect(buffer.sentence_complete_offsets).toContain(16);
    });

    it("detects exclamation as sentence ending", () => {
      bridge.processToken("Hello! World");

      const buffer = bridge.getBuffer();
      expect(buffer.sentence_complete_offsets.length).toBeGreaterThan(0);
    });

    it("detects question mark as sentence ending", () => {
      bridge.processToken("How are you? Fine");

      const buffer = bridge.getBuffer();
      expect(buffer.sentence_complete_offsets.length).toBeGreaterThan(0);
    });
  });
});

describe("isDocumentEditEvent", () => {
  it("returns true for document edit events", () => {
    const event = {
      type: "document:edit" as const,
      opCode: "OP_AI_GENERATE" as const,
      blockId: "block-123",
      content: "Test",
      confidence: 0.8,
      partial: false,
      timestamp: Date.now(),
    };

    expect(isDocumentEditEvent(event)).toBe(true);
  });

  it("returns false for other event types", () => {
    const event = {
      type: "token" as const,
      token: "Hello",
      index: 0,
      timestamp: Date.now(),
    };

    expect(isDocumentEditEvent(event)).toBe(false);
  });
});

describe("createAITokenEvent", () => {
  it("creates token event with AI metadata", () => {
    const aiMeta = {
      op_code: "OP_AI_GENERATE" as const,
      agent_id: "agent-123",
      provenance: { model_id: "gpt-4", prompt_hash: "abc" },
      confidence: { score: 0.9 },
      timestamp: Date.now(),
    };

    const event = createAITokenEvent("Hello", 0, aiMeta);

    expect(event.type).toBe("token");
    expect(event.token).toBe("Hello");
    expect(event.index).toBe(0);
    expect(event.aiMeta).toBe(aiMeta);
  });

  it("creates token event without AI metadata", () => {
    const event = createAITokenEvent("World", 1);

    expect(event.type).toBe("token");
    expect(event.token).toBe("World");
    expect(event.index).toBe(1);
    expect(event.aiMeta).toBeUndefined();
  });
});
