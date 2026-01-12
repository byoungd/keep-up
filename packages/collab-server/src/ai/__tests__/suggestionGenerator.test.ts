/**
 * Suggestion Generator Tests
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { SuggestionGenerator } from "../suggestionGenerator";

describe("SuggestionGenerator", () => {
  let generator: SuggestionGenerator;

  beforeEach(() => {
    generator = new SuggestionGenerator({
      minConfidence: 0.7,
      minCitations: 1,
      suggestionTtlMs: 60000,
      maxSuggestionsPerRequest: 3,
    });
  });

  describe("generate", () => {
    it("should generate suggestions with sufficient context", async () => {
      const response = await generator.generate({
        docId: "doc-1",
        userId: "user-1",
        type: "completion",
        context: "This is a test context with enough content",
      });

      expect(response.insufficientEvidence).toBe(false);
      expect(response.suggestions.length).toBeGreaterThan(0);
      expect(response.suggestions[0].docId).toBe("doc-1");
      expect(response.suggestions[0].type).toBe("completion");
    });

    it("should return insufficient evidence for missing context", async () => {
      const response = await generator.generate({
        docId: "doc-1",
        userId: "user-1",
        type: "completion",
        context: "short",
      });

      expect(response.insufficientEvidence).toBe(true);
      expect(response.insufficientEvidenceReason).toBe("Insufficient context provided");
      expect(response.suggestions).toHaveLength(0);
    });

    it("should return insufficient evidence for missing fields", async () => {
      const response = await generator.generate({
        docId: "",
        userId: "user-1",
        type: "completion",
      });

      expect(response.insufficientEvidence).toBe(true);
      expect(response.insufficientEvidenceReason).toBe("Missing required fields");
    });

    it("should include citations in suggestions", async () => {
      const response = await generator.generate({
        docId: "doc-1",
        userId: "user-1",
        type: "completion",
        context: "This is a test context with enough content",
      });

      expect(response.suggestions[0].citations.length).toBeGreaterThan(0);
      expect(response.suggestions[0].citations[0].type).toBeDefined();
      expect(response.suggestions[0].citations[0].confidence).toBeGreaterThan(0);
    });

    it("should respect maxSuggestions parameter", async () => {
      const response = await generator.generate({
        docId: "doc-1",
        userId: "user-1",
        type: "completion",
        context: "This is a test context with enough content",
        maxSuggestions: 1,
      });

      expect(response.suggestions.length).toBeLessThanOrEqual(1);
    });
  });

  describe("getSuggestion", () => {
    it("should retrieve stored suggestion", async () => {
      const response = await generator.generate({
        docId: "doc-1",
        userId: "user-1",
        type: "completion",
        context: "This is a test context with enough content",
      });

      const suggestionId = response.suggestions[0].id;
      const retrieved = generator.getSuggestion(suggestionId);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(suggestionId);
    });

    it("should return undefined for non-existent suggestion", () => {
      const retrieved = generator.getSuggestion("non-existent");
      expect(retrieved).toBeUndefined();
    });

    it("should return undefined for expired suggestion", async () => {
      vi.useFakeTimers();

      const expiredGenerator = new SuggestionGenerator({
        suggestionTtlMs: 1000,
      });

      const response = await expiredGenerator.generate({
        docId: "doc-1",
        userId: "user-1",
        type: "completion",
        context: "This is a test context with enough content",
      });

      const suggestionId = response.suggestions[0].id;

      // Advance past TTL
      vi.advanceTimersByTime(2000);

      const retrieved = expiredGenerator.getSuggestion(suggestionId);
      expect(retrieved).toBeUndefined();

      vi.useRealTimers();
    });
  });

  describe("updateStatus", () => {
    it("should update suggestion status", async () => {
      const response = await generator.generate({
        docId: "doc-1",
        userId: "user-1",
        type: "completion",
        context: "This is a test context with enough content",
      });

      const suggestionId = response.suggestions[0].id;
      const updated = generator.updateStatus(suggestionId, "applied");

      expect(updated).toBe(true);
      expect(generator.getSuggestion(suggestionId)?.status).toBe("applied");
    });

    it("should return false for non-existent suggestion", () => {
      const updated = generator.updateStatus("non-existent", "applied");
      expect(updated).toBe(false);
    });
  });

  describe("cleanup", () => {
    it("should remove expired suggestions", async () => {
      vi.useFakeTimers();

      const shortTtlGenerator = new SuggestionGenerator({
        suggestionTtlMs: 1000,
      });

      await shortTtlGenerator.generate({
        docId: "doc-1",
        userId: "user-1",
        type: "completion",
        context: "This is a test context with enough content",
      });

      expect(shortTtlGenerator.getSuggestionCount()).toBe(1);

      vi.advanceTimersByTime(2000);

      const removed = shortTtlGenerator.cleanup();
      expect(removed).toBe(1);
      expect(shortTtlGenerator.getSuggestionCount()).toBe(0);

      vi.useRealTimers();
    });
  });

  describe("clear", () => {
    it("should clear all suggestions", async () => {
      await generator.generate({
        docId: "doc-1",
        userId: "user-1",
        type: "completion",
        context: "This is a test context with enough content",
      });

      generator.clear();

      expect(generator.getSuggestionCount()).toBe(0);
    });
  });
});
