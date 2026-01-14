import { promises as fsp } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getProjectContextSnapshot } from "../projectContext";

async function writeFile(targetPath: string, content: string) {
  await fsp.mkdir(path.dirname(targetPath), { recursive: true });
  await fsp.writeFile(targetPath, content, "utf8");
}

describe("getProjectContextSnapshot", () => {
  it("builds sections and task summary with stable ids", async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), "keep-up-context-"));

    try {
      await writeFile(path.join(root, "pnpm-workspace.yaml"), "packages: []");
      await writeFile(
        path.join(root, "task.md"),
        "# Task: Sample Task\n\n## Checklist\n- [ ] Do thing\n- [x] Done thing\n"
      );
      await writeFile(path.join(root, "implementation_plan.md"), "# Plan\n");
      await writeFile(path.join(root, "docs/tasks/DEEP_ANALYSIS.md"), "# Analysis\n");
      await writeFile(path.join(root, "docs/tasks/track1_ui_onboarding.md"), "# Track One\n");
      await writeFile(path.join(root, ".keep-up/brain/notes.md"), "Decision log\n");

      const snapshot = await getProjectContextSnapshot({ rootPath: root });

      const taskSection = snapshot.sections.find((section) => section.sourcePath === "task.md");
      expect(taskSection).toBeTruthy();
      expect(taskSection?.blockId).toBe("project_project-tasks_task-md");

      expect(snapshot.tasks).toHaveLength(1);
      expect(snapshot.tasks[0]?.checklistTotal).toBe(2);
      expect(snapshot.tasks[0]?.checklistDone).toBe(1);
      expect(snapshot.tasks[0]?.openItems[0]).toBe("Do thing");

      const analysisPath = path.join("docs", "tasks", "DEEP_ANALYSIS.md");
      const analysisSections = snapshot.sections.filter(
        (section) => section.sourcePath === analysisPath
      );
      expect(analysisSections).toHaveLength(1);

      const memoryPath = path.join(".keep-up", "brain", "notes.md");
      const memorySection = snapshot.sections.find((section) => section.sourcePath === memoryPath);
      expect(memorySection?.label).toBe("Project Memory");
    } finally {
      await fsp.rm(root, { recursive: true, force: true });
    }
  });
});
