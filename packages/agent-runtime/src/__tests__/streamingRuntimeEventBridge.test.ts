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

  it("emits tool activity metadata with friendly progress messages", async () => {
    const eventBus = createEventBus();
    const writer = createStreamWriter("stream-bridge");
    attachRuntimeEventStreamBridge({ eventBus, stream: writer, correlationId: "corr-2" });

    eventBus.emit(
      "execution:record",
      {
        toolCallId: "call-2",
        toolName: "browser.search",
        status: "started",
        durationMs: 0,
        sandboxed: true,
      },
      { correlationId: "corr-2", source: "bridge-test" }
    );

    writer.close();

    const chunks = await collectStream(writer);
    const activityChunk = chunks.find(
      (chunk) => chunk.type === "metadata" && chunk.data.key === "tool:activity"
    );
    const progressChunk = chunks.find((chunk) => chunk.type === "progress");

    expect(activityChunk?.data.value).toEqual(
      expect.objectContaining({
        activity: "search",
        toolName: "browser.search",
        status: "started",
      })
    );
    expect(progressChunk?.data).toEqual(expect.objectContaining({ message: "Searching..." }));
  });

  it("streams subagent execution events with nested metadata", async () => {
    const eventBus = createEventBus();
    const childBus = createEventBus();
    const writer = createStreamWriter("stream-bridge");
    attachRuntimeEventStreamBridge({ eventBus, stream: writer, correlationId: "parent-1" });

    const innerEvent = childBus.emit(
      "execution:record",
      {
        toolCallId: "call-1",
        toolName: "bash",
        status: "started",
        durationMs: 0,
        sandboxed: true,
      },
      { correlationId: "child-1", source: "child-agent" }
    );

    eventBus.emit(
      "subagent:event",
      {
        agentId: "agent-1",
        parentId: "parent-1",
        event: innerEvent,
      },
      { correlationId: "parent-1", source: "parent-agent" }
    );

    writer.close();

    const chunks = await collectStream(writer);
    const subagentMetadata = chunks.find(
      (chunk) => chunk.type === "metadata" && chunk.data.key === "subagent:event"
    );
    const progressChunk = chunks.find((chunk) => chunk.type === "progress");

    expect(subagentMetadata).toBeDefined();
    expect(progressChunk?.data.message).toContain("Subagent agent-1:");

    childBus.dispose();
  });
});
