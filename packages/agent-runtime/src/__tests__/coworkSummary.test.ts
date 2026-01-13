/**
 * Cowork Task Summary Tests
 */

import { describe, expect, it } from "vitest";
import { buildCoworkTaskSummary } from "../cowork/summary";
import type { AuditEntry } from "../types";

describe("buildCoworkTaskSummary", () => {
  it("collects file changes and outputs", () => {
    const entries: AuditEntry[] = [
      {
        timestamp: 1,
        toolName: "file:write",
        action: "result",
        input: { path: "/workspace/output/report.md" },
        sandboxed: true,
      },
      {
        timestamp: 2,
        toolName: "file:delete",
        action: "result",
        input: { path: "/workspace/tmp/old.md" },
        sandboxed: true,
      },
    ];

    const summary = buildCoworkTaskSummary({
      taskId: "task-1",
      auditEntries: entries,
      outputRoots: ["/workspace/output"],
    });

    expect(summary.fileChanges).toHaveLength(2);
    expect(summary.outputs).toEqual([{ path: "/workspace/output/report.md", kind: "document" }]);
  });
});
