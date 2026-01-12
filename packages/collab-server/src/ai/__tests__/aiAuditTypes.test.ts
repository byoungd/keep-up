/**
 * AI Audit Types Tests
 */

import { describe, expect, it } from "vitest";
import {
  createSuggestionAppliedEvent,
  createSuggestionGeneratedEvent,
  createSuggestionRejectedEvent,
  createSuggestionUndoneEvent,
} from "../aiAuditTypes";

describe("AI Audit Types", () => {
  describe("createSuggestionGeneratedEvent", () => {
    it("should create generated event with required fields", () => {
      const event = createSuggestionGeneratedEvent("sug-1", "doc-1", "user-1");

      expect(event.eventType).toBe("AI_SUGGESTION_GENERATED");
      expect(event.metadata.suggestionId).toBe("sug-1");
      expect(event.metadata.docId).toBe("doc-1");
      expect(event.metadata.actorId).toBe("user-1");
      expect(event.metadata.ts).toBeGreaterThan(0);
    });

    it("should include optional fields", () => {
      const event = createSuggestionGeneratedEvent("sug-1", "doc-1", "user-1", {
        suggestionType: "completion",
        hasCitations: true,
        citationCount: 3,
      });

      expect(event.metadata.suggestionType).toBe("completion");
      expect(event.metadata.hasCitations).toBe(true);
      expect(event.metadata.citationCount).toBe(3);
    });
  });

  describe("createSuggestionAppliedEvent", () => {
    it("should create applied event with bytes delta", () => {
      const event = createSuggestionAppliedEvent("sug-1", "doc-1", "user-1", 150);

      expect(event.eventType).toBe("AI_SUGGESTION_APPLIED");
      expect(event.metadata.suggestionId).toBe("sug-1");
      expect(event.metadata.bytesLenDelta).toBe(150);
    });
  });

  describe("createSuggestionRejectedEvent", () => {
    it("should create rejected event", () => {
      const event = createSuggestionRejectedEvent("sug-1", "doc-1", "user-1");

      expect(event.eventType).toBe("AI_SUGGESTION_REJECTED");
      expect(event.metadata.suggestionId).toBe("sug-1");
    });
  });

  describe("createSuggestionUndoneEvent", () => {
    it("should create undone event with negative bytes delta", () => {
      const event = createSuggestionUndoneEvent("sug-1", "doc-1", "user-1", -150);

      expect(event.eventType).toBe("AI_SUGGESTION_UNDONE");
      expect(event.metadata.bytesLenDelta).toBe(-150);
    });
  });
});
