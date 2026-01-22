/**
 * Tool Scorer Tests
 */

import type { MCPTool, SecurityPolicy, ToolContext } from "@ku0/agent-runtime-core";
import { describe, expect, it } from "vitest";
import { createExecutionFeedbackTracker } from "../executionFeedback";
import { createToolScorer, ToolScorer } from "../toolScorer";

// Create mock tool
function createMockTool(name: string, description: string): MCPTool {
  return {
    name,
    description,
    inputSchema: { type: "object", properties: {} },
  } as MCPTool;
}

// Create minimal context
function createContext(): ToolContext {
  const security: SecurityPolicy = {
    allowedPaths: [],
    sandboxCommands: false,
    allowNetworkAccess: false,
    maxFileSize: 0,
    disallowedPatterns: [],
    requireConfirmation: false,
    blockSystemModification: true,
    auditActions: true,
  };
  return { security };
}

describe("ToolScorer", () => {
  it("should create scorer with default config", () => {
    const scorer = createToolScorer();
    expect(scorer).toBeInstanceOf(ToolScorer);
  });

  it("should create scorer with custom config", () => {
    const scorer = createToolScorer({
      recommendationThreshold: 70,
      minSuccessRate: 0.8,
    });
    expect(scorer).toBeInstanceOf(ToolScorer);
  });

  it("should create scorer with feedback tracker", () => {
    const tracker = createExecutionFeedbackTracker();
    const scorer = createToolScorer({}, tracker);
    expect(scorer).toBeInstanceOf(ToolScorer);
  });

  describe("scoreTool", () => {
    it("should score a tool based on name and description", () => {
      const scorer = createToolScorer();
      const tool = createMockTool("read_file", "Read contents of a file");
      const context = createContext();

      const score = scorer.scoreTool(tool, context);

      expect(score.toolName).toBe("read_file");
      expect(score.overallScore).toBeGreaterThan(0);
      expect(score.relevanceScore).toBeGreaterThan(0.5); // Has "read" and "file"
    });

    it("should boost code-related tools", () => {
      const scorer = createToolScorer();
      const codeTool = createMockTool("lint_code", "Lint source code files");
      const otherTool = createMockTool("send_email", "Send an email message");
      const context = createContext();

      const codeScore = scorer.scoreTool(codeTool, context);
      const otherScore = scorer.scoreTool(otherTool, context);

      expect(codeScore.relevanceScore).toBeGreaterThan(otherScore.relevanceScore);
    });

    it("should boost git tools", () => {
      const scorer = createToolScorer();
      const gitTool = createMockTool("git_commit", "Commit changes to git");
      const otherTool = createMockTool("random_tool", "Does something random");
      const context = createContext();

      const gitScore = scorer.scoreTool(gitTool, context);
      const otherScore = scorer.scoreTool(otherTool, context);

      expect(gitScore.relevanceScore).toBeGreaterThan(otherScore.relevanceScore);
    });
  });

  describe("scoreTools", () => {
    it("should rank tools by score", () => {
      const scorer = createToolScorer();
      const tools = [
        createMockTool("random_action", "Something random"),
        createMockTool("edit_file", "Edit a source file"),
        createMockTool("write_code", "Write code to a file"),
      ];
      const context = createContext();

      const scores = scorer.scoreTools(context, tools);

      expect(scores).toHaveLength(3);
      expect(scores[0].overallScore).toBeGreaterThanOrEqual(scores[1].overallScore);
      expect(scores[1].overallScore).toBeGreaterThanOrEqual(scores[2].overallScore);
    });
  });

  describe("with feedback tracker", () => {
    it("should incorporate success rate from tracker", () => {
      const tracker = createExecutionFeedbackTracker();
      const scorer = createToolScorer({}, tracker);

      // Record outcomes for a tool
      for (let i = 0; i < 10; i++) {
        tracker.recordOutcome("reliable_tool", { success: true, durationMs: 100 });
      }
      for (let i = 0; i < 10; i++) {
        tracker.recordOutcome("unreliable_tool", {
          success: i < 3,
          durationMs: 100,
        });
      }

      const context = createContext();
      const reliableScore = scorer.scoreTool(createMockTool("reliable_tool", "A tool"), context);
      const unreliableScore = scorer.scoreTool(
        createMockTool("unreliable_tool", "A tool"),
        context
      );

      expect(reliableScore.successRate).toBe(1.0);
      expect(unreliableScore.successRate).toBe(0.3);
      expect(reliableScore.overallScore).toBeGreaterThan(unreliableScore.overallScore);
    });

    it("should mark tools with low success rate as not recommended", () => {
      const tracker = createExecutionFeedbackTracker();
      const scorer = createToolScorer({ minSuccessRate: 0.7 }, tracker);

      // Record low success rate
      for (let i = 0; i < 10; i++) {
        tracker.recordOutcome("bad_tool", {
          success: i < 3,
          durationMs: 100,
        });
      }

      const context = createContext();
      const score = scorer.scoreTool(createMockTool("bad_tool", "A tool"), context);

      expect(score.recommended).toBe(false);
      expect(score.reason).toContain("Low success rate");
    });
  });

  describe("filterByThreshold", () => {
    it("should filter scores by threshold", () => {
      const scorer = createToolScorer();
      const scores = [
        {
          toolName: "high",
          overallScore: 80,
          relevanceScore: 0.8,
          successRate: -1,
          avgLatencyMs: -1,
          recommended: true,
        },
        {
          toolName: "low",
          overallScore: 40,
          relevanceScore: 0.4,
          successRate: -1,
          avgLatencyMs: -1,
          recommended: false,
        },
      ];

      const filtered = scorer.filterByThreshold(scores, 50);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].toolName).toBe("high");
    });
  });

  describe("getRecommended", () => {
    it("should return only recommended tools", () => {
      const scorer = createToolScorer();
      const scores = [
        {
          toolName: "rec",
          overallScore: 80,
          relevanceScore: 0.8,
          successRate: -1,
          avgLatencyMs: -1,
          recommended: true,
        },
        {
          toolName: "not",
          overallScore: 60,
          relevanceScore: 0.6,
          successRate: -1,
          avgLatencyMs: -1,
          recommended: false,
        },
      ];

      const recommended = scorer.getRecommended(scores);
      expect(recommended).toHaveLength(1);
      expect(recommended[0].toolName).toBe("rec");
    });
  });
});
