/**
 * Runtime Event Stream Bridge Tests
 */

import { describe, expect, it } from "vitest";
import { createEventBus } from "../events";
import { attachRuntimeEventStreamBridge, collectStream, createStreamWriter } from "../streaming";
import type { ArtifactEnvelope } from "../types";

function createArtifact(id: string, overrides: Partial<ArtifactEnvelope> = {}): ArtifactEnvelope {
  return {
    id,
    type: "PlanCard",
    schemaVersion: "1.0.0",
    title: "Plan",
    payload: {
      goal: "Bridge runtime events",
      steps: [{ title: "Step one" }],
    },
    taskNodeId: "task-1",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("RuntimeEventStreamBridge", () => {
  it("streams execution and artifact events into progress/metadata chunks", async () => {
    const eventBus = createEventBus();
    const writer = createStreamWriter("stream-bridge");
    attachRuntimeEventStreamBridge({ eventBus, stream: writer, correlationId: "corr-1" });

    eventBus.emit(
      "execution:record",
      {
        toolCallId: "call-1",
        toolName: "ping",
        status: "started",
        durationMs: 0,
        sandboxed: true,
      },
      { correlationId: "corr-1", source: "bridge-test" }
    );
    eventBus.emit(
      "execution:record",
      {
        toolCallId: "call-1",
        toolName: "ping",
        status: "completed",
        durationMs: 12,
        sandboxed: true,
      },
      { correlationId: "corr-1", source: "bridge-test" }
    );
    eventBus.emit(
      "artifact:emitted",
      {
        artifact: createArtifact("artifact-1"),
        stored: true,
        valid: true,
        artifactNodeId: "node-1",
      },
      { correlationId: "corr-1", source: "bridge-test" }
    );
    eventBus.emit(
      "artifact:quarantined",
      {
        artifact: createArtifact("artifact-2"),
        errors: ["Invalid payload"],
        artifactNodeId: "node-2",
      },
      { correlationId: "corr-1", source: "bridge-test" }
    );

    writer.close();

    const chunks = await collectStream(writer);
    const progressChunks = chunks.filter((chunk) => chunk.type === "progress");
    const metadataChunks = chunks.filter((chunk) => chunk.type === "metadata");
    const errorChunks = chunks.filter((chunk) => chunk.type === "error");

    expect(progressChunks.length).toBeGreaterThanOrEqual(2);
    expect(metadataChunks.some((chunk) => chunk.data.key === "execution:record")).toBe(true);
    expect(metadataChunks.some((chunk) => chunk.data.key === "artifact")).toBe(true);
    expect(metadataChunks.some((chunk) => chunk.data.key === "artifact:quarantined")).toBe(true);
    expect(errorChunks).toHaveLength(1);
  });
});
