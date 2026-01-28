import { describe, expect, it } from "vitest";
import type { NodeMessage } from "../protocol";
import { NodeRegistry } from "../registry";

function createMockTransport() {
  const sent: string[] = [];
  return {
    sent,
    transport: {
      send: (data: string) => {
        sent.push(data);
      },
      close: () => undefined,
    },
  };
}

function sendMessage(handle: { onMessage: (raw: string) => void }, message: NodeMessage) {
  handle.onMessage(JSON.stringify(message));
}

describe("NodeRegistry", () => {
  it("registers nodes and lists them", () => {
    const now = 1000;
    const registry = new NodeRegistry({ now: () => now });
    const { transport } = createMockTransport();
    const handle = registry.handleConnection(transport);

    sendMessage(handle, {
      type: "node.hello",
      nodeId: "node-1",
      name: "Desk",
      capabilities: [{ command: "system.notify" }],
    });

    const nodes = registry.listNodes();
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({
      id: "node-1",
      name: "Desk",
      status: "online",
    });
  });

  it("invokes nodes and resolves responses", async () => {
    const registry = new NodeRegistry({ requestTimeoutMs: 5000 });
    const { transport, sent } = createMockTransport();
    const handle = registry.handleConnection(transport);

    sendMessage(handle, {
      type: "node.hello",
      nodeId: "node-2",
      capabilities: [{ command: "system.notify" }],
    });

    const invokePromise = registry.invokeNode("node-2", "system.notify", { message: "Hi" });

    const last = sent.at(-1);
    expect(last).toBeTruthy();
    const invoke = JSON.parse(last ?? "{}") as NodeMessage;
    expect(invoke.type).toBe("node.invoke");

    if (invoke.type === "node.invoke") {
      sendMessage(handle, {
        type: "node.result",
        requestId: invoke.requestId,
        success: true,
        result: { ok: true },
      });
    }

    await expect(invokePromise).resolves.toMatchObject({
      success: true,
      result: { ok: true },
    });
  });

  it("marks nodes offline after presence timeout", () => {
    let now = 1000;
    const registry = new NodeRegistry({
      now: () => now,
      presenceTimeoutMs: 100,
      offlineRetentionMs: 1000,
    });
    const { transport } = createMockTransport();
    const handle = registry.handleConnection(transport);

    sendMessage(handle, {
      type: "node.hello",
      nodeId: "node-3",
      capabilities: [],
    });

    now = 2000;
    registry.pruneStale(now);

    const nodes = registry.listNodes();
    expect(nodes).toHaveLength(1);
    expect(nodes[0].status).toBe("offline");
  });
});
