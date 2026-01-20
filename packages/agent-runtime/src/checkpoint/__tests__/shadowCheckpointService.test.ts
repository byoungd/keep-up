import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";
import { createCheckpointManager, InMemoryCheckpointStorage } from "../checkpointManager";
import { ShadowCheckpointService } from "../shadow";

const execFileAsync = promisify(execFile);

async function canRunGit(): Promise<boolean> {
  try {
    await execFileAsync("git", ["--version"]);
    return true;
  } catch {
    return false;
  }
}

const hasGit = await canRunGit();
const describeIfGit = hasGit ? describe : describe.skip;

function createSilentLogger() {
  return {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  };
}

describeIfGit("ShadowCheckpointService", () => {
  it("diffs and restores checkpoints", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ku0-workspace-"));
    const storage = await mkdtemp(join(tmpdir(), "ku0-shadow-"));

    try {
      const filePath = join(workspace, "alpha.txt");
      await writeFile(filePath, "one", "utf-8");

      const service = new ShadowCheckpointService({
        taskId: "task-1",
        workspacePath: workspace,
        storagePath: storage,
        logger: createSilentLogger(),
      });
      await service.init();

      await writeFile(filePath, "two", "utf-8");
      const first = await service.saveCheckpoint("update alpha");
      expect(first?.commit).toBeDefined();

      await writeFile(filePath, "three", "utf-8");
      const second = await service.saveCheckpoint("update alpha again");
      expect(second?.commit).toBeDefined();

      const diffs = await service.getDiff({ from: first?.commit, to: second?.commit });
      expect(diffs).toHaveLength(1);
      expect(diffs[0].content.before).toContain("two");
      expect(diffs[0].content.after).toContain("three");

      await service.restoreCheckpoint(first?.commit ?? "");
      const restored = await readFile(filePath, "utf-8");
      expect(restored).toBe("two");
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(storage, { recursive: true, force: true });
    }
  });

  it("stores shadow metadata on runtime checkpoints", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ku0-workspace-"));
    const storage = await mkdtemp(join(tmpdir(), "ku0-shadow-"));

    try {
      const filePath = join(workspace, "alpha.txt");
      await writeFile(filePath, "one", "utf-8");

      const service = new ShadowCheckpointService({
        taskId: "task-2",
        workspacePath: workspace,
        storagePath: storage,
        logger: createSilentLogger(),
      });
      await service.init();

      const storageAdapter = new InMemoryCheckpointStorage();
      const checkpointManager = createCheckpointManager({ storage: storageAdapter });
      const checkpoint = await checkpointManager.create({
        task: "shadow",
        agentType: "runtime",
        agentId: "agent-1",
      });

      await writeFile(filePath, "two", "utf-8");
      const metadata = await service.saveCheckpoint("checkpoint", {
        checkpointId: checkpoint.id,
        checkpointManager,
      });

      const loaded = await checkpointManager.load(checkpoint.id);
      expect(metadata?.commit).toBeDefined();
      expect(loaded?.metadata.shadowCheckpoint).toMatchObject({
        commit: metadata?.commit,
        message: "checkpoint",
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(storage, { recursive: true, force: true });
    }
  });
});
