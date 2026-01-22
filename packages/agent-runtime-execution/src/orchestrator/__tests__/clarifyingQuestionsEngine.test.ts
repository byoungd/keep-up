/**
 * Clarifying Questions Engine Tests
 *
 * Tests for question generation based on request patterns.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  type ClarifyingQuestionsEngine,
  createClarifyingQuestionsEngine,
} from "../clarifyingQuestionsEngine";

describe("ClarifyingQuestionsEngine", () => {
  let engine: ClarifyingQuestionsEngine;

  beforeEach(() => {
    engine = createClarifyingQuestionsEngine();
  });

  describe("generateQuestions()", () => {
    it("should generate questions for API requests", async () => {
      const questions = await engine.generateQuestions("Create a new API endpoint");
      expect(questions.length).toBeGreaterThan(0);
      expect(questions.some((q) => q.category === "scope")).toBe(true);
    });

    it("should generate questions for refactoring requests", async () => {
      const questions = await engine.generateQuestions("Refactor the user module");
      expect(questions.length).toBeGreaterThan(0);
      expect(questions.some((q) => q.question.toLowerCase().includes("file"))).toBe(true);
    });

    it("should generate questions for testing requests", async () => {
      const questions = await engine.generateQuestions("Write tests for the auth module");
      expect(questions.length).toBeGreaterThan(0);
      expect(questions.some((q) => q.category === "testing")).toBe(true);
    });

    it("should generate questions for bug fix requests", async () => {
      const questions = await engine.generateQuestions("Fix the login bug");
      expect(questions.length).toBeGreaterThan(0);
      expect(questions.some((q) => q.question.toLowerCase().includes("reproduce"))).toBe(true);
    });

    it("should generate generic questions for vague requests", async () => {
      const questions = await engine.generateQuestions("Help");
      expect(questions.length).toBeGreaterThan(0);
    });

    it("should respect maxQuestions config", async () => {
      const limitedEngine = createClarifyingQuestionsEngine({ maxQuestions: 2 });
      const questions = await limitedEngine.generateQuestions(
        "Add API endpoint and implement refactoring with tests"
      );
      expect(questions.length).toBeLessThanOrEqual(2);
    });

    it("should include suggestions when enabled", async () => {
      const questions = await engine.generateQuestions("Add API endpoint");
      const questionsWithSuggestions = questions.filter(
        (q) => q.suggestions && q.suggestions.length > 0
      );
      expect(questionsWithSuggestions.length).toBeGreaterThan(0);
    });
  });

  describe("updateAnswer()", () => {
    it("should update question with answer", async () => {
      const questions = await engine.generateQuestions("Create API");
      const firstQuestion = questions[0];

      engine.updateAnswer(firstQuestion.id, "Use GraphQL");

      const updated = engine.getQuestion(firstQuestion.id);
      expect(updated?.answer).toBe("Use GraphQL");
      expect(updated?.answeredAt).toBeDefined();
    });
  });

  describe("hasBlockingUnanswered()", () => {
    it("should return true when blocking questions are unanswered", async () => {
      await engine.generateQuestions("Create API endpoint");
      // API requests generate blocking questions
      expect(engine.hasBlockingUnanswered()).toBe(true);
    });

    it("should return false when all blocking questions are answered", async () => {
      const questions = await engine.generateQuestions("Create API endpoint");
      const blockingQuestions = questions.filter((q) => q.priority === "blocking");

      for (const q of blockingQuestions) {
        engine.updateAnswer(q.id, "Answer");
      }

      expect(engine.hasBlockingUnanswered()).toBe(false);
    });
  });

  describe("getContext()", () => {
    it("should return empty string when no questions answered", async () => {
      await engine.generateQuestions("Create API");
      expect(engine.getContext()).toBe("");
    });

    it("should format answered questions as markdown", async () => {
      const questions = await engine.generateQuestions("Create API");
      engine.updateAnswer(questions[0].id, "REST API");

      const context = engine.getContext();
      expect(context).toContain("Q:");
      expect(context).toContain("A:");
      expect(context).toContain("REST API");
    });
  });

  describe("clear()", () => {
    it("should clear all questions", async () => {
      await engine.generateQuestions("Create API");
      expect(engine.getQuestions().length).toBeGreaterThan(0);

      engine.clear();
      expect(engine.getQuestions().length).toBe(0);
    });
  });
});
