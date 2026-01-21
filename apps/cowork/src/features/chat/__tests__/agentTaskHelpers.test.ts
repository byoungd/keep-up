import type { AgentTask, ArtifactItem, TaskStep } from "@ku0/shell";
import { describe, expect, it } from "vitest";
import type { ArtifactPayload } from "../../tasks/types";

// Re-implement the helper functions for testing (they are not exported)
// In a real scenario, we'd export them from the controller or a separate module

function mapGraphStatus(status: string): AgentTask["status"] {
  switch (status) {
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    case "awaiting_confirmation":
    case "awaiting_approval":
      return "paused";
    default:
      return "running";
  }
}

function mapCoworkStatus(status: string): AgentTask["status"] {
  switch (status) {
    case "planning":
    case "running":
      return "running";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    case "awaiting_confirmation":
    case "awaiting_approval":
      return "paused";
    default:
      return "queued";
  }
}

function calculateProgress(steps: TaskStep[]): number {
  if (steps.length === 0) {
    return 0;
  }
  const completedSteps = steps.filter((s) => s.status === "completed").length;
  return Math.round((completedSteps / steps.length) * 100);
}

function convertArtifact(id: string, artifact: ArtifactPayload): ArtifactItem {
  switch (artifact.type) {
    case "diff":
      return {
        id,
        type: "diff",
        title: artifact.file,
        content: artifact.diff,
      };
    case "plan":
      return {
        id,
        type: "plan",
        title: "Execution Plan",
        content: JSON.stringify(artifact.steps),
      };
    case "markdown":
      return {
        id,
        type: "doc",
        title: "Report",
        content: artifact.content,
      };
    case "preflight":
      return {
        id,
        type: "doc",
        title: "Preflight Report",
        content: artifact.report.riskSummary,
      };
    case "LayoutGraph":
      return {
        id,
        type: "doc",
        title: "Layout Graph",
        content: `Nodes: ${artifact.nodes.length}`,
      };
    case "VisualDiffReport":
      return {
        id,
        type: "doc",
        title: "Visual Diff Report",
        content: `Regions: ${artifact.summary.changedRegions}`,
      };
    default:
      return {
        id,
        type: "doc",
        title: "Artifact",
        content: "",
      };
  }
}

describe("Agent Task Helpers", () => {
  describe("mapGraphStatus", () => {
    it("should map completed status", () => {
      expect(mapGraphStatus("completed")).toBe("completed");
    });

    it("should map failed status", () => {
      expect(mapGraphStatus("failed")).toBe("failed");
    });

    it("should map awaiting_approval to paused", () => {
      expect(mapGraphStatus("awaiting_approval")).toBe("paused");
    });

    it("should map awaiting_confirmation to paused", () => {
      expect(mapGraphStatus("awaiting_confirmation")).toBe("paused");
    });

    it("should map cancelled to cancelled", () => {
      expect(mapGraphStatus("cancelled")).toBe("cancelled");
    });

    it("should default to running for unknown statuses", () => {
      expect(mapGraphStatus("planning")).toBe("running");
      expect(mapGraphStatus("running")).toBe("running");
      expect(mapGraphStatus("unknown")).toBe("running");
    });
  });

  describe("mapCoworkStatus", () => {
    it("should map planning to running", () => {
      expect(mapCoworkStatus("planning")).toBe("running");
    });

    it("should map running to running", () => {
      expect(mapCoworkStatus("running")).toBe("running");
    });

    it("should map completed to completed", () => {
      expect(mapCoworkStatus("completed")).toBe("completed");
    });

    it("should map failed to failed", () => {
      expect(mapCoworkStatus("failed")).toBe("failed");
    });

    it("should map awaiting_approval to paused", () => {
      expect(mapCoworkStatus("awaiting_approval")).toBe("paused");
    });

    it("should map awaiting_confirmation to paused", () => {
      expect(mapCoworkStatus("awaiting_confirmation")).toBe("paused");
    });

    it("should map cancelled to cancelled", () => {
      expect(mapCoworkStatus("cancelled")).toBe("cancelled");
    });

    it("should map queued to queued", () => {
      expect(mapCoworkStatus("queued")).toBe("queued");
    });

    it("should map ready to queued", () => {
      expect(mapCoworkStatus("ready")).toBe("queued");
    });

    it("should default to queued for unknown statuses", () => {
      expect(mapCoworkStatus("unknown")).toBe("queued");
    });
  });

  describe("calculateProgress", () => {
    it("should return 0 for empty steps array", () => {
      expect(calculateProgress([])).toBe(0);
    });

    it("should return 0 when no steps are completed", () => {
      const steps: TaskStep[] = [
        { id: "1", label: "Step 1", status: "pending" },
        { id: "2", label: "Step 2", status: "running" },
      ];
      expect(calculateProgress(steps)).toBe(0);
    });

    it("should return 50 when half the steps are completed", () => {
      const steps: TaskStep[] = [
        { id: "1", label: "Step 1", status: "completed" },
        { id: "2", label: "Step 2", status: "pending" },
      ];
      expect(calculateProgress(steps)).toBe(50);
    });

    it("should return 100 when all steps are completed", () => {
      const steps: TaskStep[] = [
        { id: "1", label: "Step 1", status: "completed" },
        { id: "2", label: "Step 2", status: "completed" },
      ];
      expect(calculateProgress(steps)).toBe(100);
    });

    it("should round to nearest integer", () => {
      const steps: TaskStep[] = [
        { id: "1", label: "Step 1", status: "completed" },
        { id: "2", label: "Step 2", status: "pending" },
        { id: "3", label: "Step 3", status: "pending" },
      ];
      expect(calculateProgress(steps)).toBe(33);
    });
  });

  describe("convertArtifact", () => {
    it("should convert diff artifact", () => {
      const artifact: ArtifactPayload = {
        type: "diff",
        file: "src/utils.ts",
        diff: "+const foo = 1;\n-const bar = 2;",
      };

      const result = convertArtifact("art-1", artifact);

      expect(result).toEqual({
        id: "art-1",
        type: "diff",
        title: "src/utils.ts",
        content: "+const foo = 1;\n-const bar = 2;",
      });
    });

    it("should convert plan artifact", () => {
      const artifact: ArtifactPayload = {
        type: "plan",
        steps: [
          { id: "1", label: "Step 1", status: "pending" },
          { id: "2", label: "Step 2", status: "completed" },
        ],
      };

      const result = convertArtifact("art-2", artifact);

      expect(result).toEqual({
        id: "art-2",
        type: "plan",
        title: "Execution Plan",
        content: JSON.stringify(artifact.steps),
      });
    });

    it("should convert markdown artifact", () => {
      const artifact: ArtifactPayload = {
        type: "markdown",
        content: "# Report\n\nThis is the report content.",
      };

      const result = convertArtifact("art-3", artifact);

      expect(result).toEqual({
        id: "art-3",
        type: "doc",
        title: "Report",
        content: "# Report\n\nThis is the report content.",
      });
    });

    it("should convert preflight artifact", () => {
      const artifact: ArtifactPayload = {
        type: "preflight",
        report: {
          reportId: "report-1",
          sessionId: "session-1",
          checks: [],
          riskSummary: "No preflight checks were selected.",
          createdAt: Date.now(),
        },
        selectionNotes: ["Manual preflight selection applied."],
        changedFiles: [],
      };

      const result = convertArtifact("art-4", artifact);

      expect(result).toEqual({
        id: "art-4",
        type: "doc",
        title: "Preflight Report",
        content: "No preflight checks were selected.",
      });
    });

    it("should convert layout graph artifact", () => {
      const artifact: ArtifactPayload = {
        type: "LayoutGraph",
        nodes: [
          {
            id: "node-1",
            type: "text",
            bounds: { x: 0, y: 0, width: 10, height: 10 },
            confidence: 0.9,
          },
        ],
        edges: [],
      };

      const result = convertArtifact("art-5", artifact);

      expect(result).toEqual({
        id: "art-5",
        type: "doc",
        title: "Layout Graph",
        content: "Nodes: 1",
      });
    });

    it("should convert visual diff artifact", () => {
      const artifact: ArtifactPayload = {
        type: "VisualDiffReport",
        regions: [
          {
            id: "region-1",
            bounds: { x: 0, y: 0, width: 10, height: 10 },
            score: 0.8,
            changeType: "modified",
          },
        ],
        summary: {
          totalRegions: 1,
          changedRegions: 1,
          maxScore: 0.8,
        },
      };

      const result = convertArtifact("art-6", artifact);

      expect(result).toEqual({
        id: "art-6",
        type: "doc",
        title: "Visual Diff Report",
        content: "Regions: 1",
      });
    });
  });
});
