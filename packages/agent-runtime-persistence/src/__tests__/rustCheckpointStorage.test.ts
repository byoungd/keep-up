/**
 * Rust-backed Checkpoint Storage Tests
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { NativeStorageEngine } from "@ku0/storage-engine-rs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Checkpoint } from "../checkpoint";
import { RustCheckpointStorage } from "../checkpoint";

class InMemoryStorageEngine implements NativeStorageEngine {
  private readonly checkpoints = new Map<string, Uint8Array>();
  private readonly events: Uint8Array[] = [];

  saveCheckpoint(id: string, data: Uint8Array): void {
    this.checkpoints.set(id, new Uint8Array(data));
  }

  loadCheckpoint(id: string): Uint8Array | null {
    const payload = this.checkpoints.get(id);
    return payload ? new Uint8Array(payload) : null;
  }

  deleteCheckpoint(id: string): boolean {
    return this.checkpoints.delete(id);
  }

  appendEvent(data: Uint8Array): bigint {
    this.events.push(new Uint8Array(data));
    return BigInt(this.events.length - 1);
  }

  replayEvents(from: bigint, limit?: number): Uint8Array[] {
    const start = Number(from);
    if (!Number.isSafeInteger(start) || start < 0) {
      throw new RangeError("from must be a non-negative safe integer.");
    }
    const end = limit ? start + limit : undefined;
    return this.events.slice(start, end).map((payload) => new Uint8Array(payload));
  }

  pruneEvents(before: bigint): bigint {
    const cutoff = Number(before);
    if (!Number.isSafeInteger(cutoff) || cutoff < 0) {
      throw new RangeError("before must be a non-negative safe integer.");
    }
    const removed = Math.min(cutoff, this.events.length);
    this.events.splice(0, removed);
    return BigInt(removed);
  }
}

describe("RustCheckpointStorage", () => {
  let rootDir: string;

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), "ku0-native-checkpoints-"));
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it("round-trips full checkpoints", async () => {
    const storage = new RustCheckpointStorage({
      rootDir,
      engine: new InMemoryStorageEngine(),
    });
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
    const storage = new RustCheckpointStorage({
      rootDir,
      engine: new InMemoryStorageEngine(),
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
