/**
 * MessagePack Checkpoint Storage Tests
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Checkpoint } from "../checkpoint";
import { MessagePackCheckpointStorage } from "../messagePackCheckpointStorage";

describe("MessagePackCheckpointStorage", () => {
  let rootDir: string;

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), "ku0-checkpoints-"));
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it("round-trips full checkpoints", async () => {
    const storage = new MessagePackCheckpointStorage({ rootDir });
    const checkpoint: Checkpoint = {
      id: "ckpt_1",
      version: 1,
      createdAt: 1,
      task: "Test task",
      agentType: "tester",
      agentId: "agent-1",
      status: "pending",
      messages: [],
      pendingToolCalls: [],
      completedToolCalls: [],
      currentStep: 0,
      maxSteps: 5,
      metadata: { build: "alpha" },
      childCheckpointIds: [],
    };

    await storage.save(checkpoint);
    const loaded = await storage.load(checkpoint.id);

    expect(loaded).toEqual(checkpoint);
  });

  it("uses delta storage for incremental checkpoints", async () => {
    const storage = new MessagePackCheckpointStorage({
      rootDir,
      minDeltaSavingsRatio: 0.99,
    });

    const base: Checkpoint = {
      id: "ckpt_base",
      version: 1,
      createdAt: 1,
      task: "Base task",
      agentType: "tester",
      agentId: "agent-1",
      status: "pending",
      messages: [{ role: "user", content: "start", timestamp: 1 }],
      pendingToolCalls: [],
      completedToolCalls: [],
      currentStep: 0,
      maxSteps: 5,
      metadata: { payload: "x".repeat(500) },
      childCheckpointIds: [],
    };

    const next: Checkpoint = {
      ...base,
      id: "ckpt_next",
      createdAt: 2,
      currentStep: 1,
      status: "completed",
      messages: [...base.messages, { role: "assistant", content: "done", timestamp: 2 }],
    };

    await storage.save(base);
    await storage.save(next);

    const loaded = await storage.load(next.id);
    expect(loaded).toEqual(next);

    const indexPath = join(rootDir, "index.json");
    const indexContent = await readFile(indexPath, "utf-8");
    const index = JSON.parse(indexContent) as { entries: Array<{ id: string; isDelta: boolean }> };
    const entry = index.entries.find((item) => item.id === next.id);
    expect(entry?.isDelta).toBe(true);
  });
});
