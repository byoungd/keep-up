import { describe, expect, it } from "vitest";
import { ChannelRegistry } from "../channels/registry";
import type { ChannelAdapter, ChannelTarget } from "../channels/types";
import { ChannelRouter } from "../routing/router";

class MockAdapter implements ChannelAdapter {
  readonly id = "mock";
  readonly channel = "mock";
  readonly sent: Array<{ target: ChannelTarget; text: string }> = [];

  async start(): Promise<void> {
    return undefined;
  }

  async stop(): Promise<void> {
    return undefined;
  }

  async sendMessage(target: ChannelTarget, text: string): Promise<void> {
    this.sent.push({ target, text });
  }
}

describe("ChannelRouter", () => {
  it("routes allowed messages to the configured session", async () => {
    const registry = new ChannelRegistry();
    const adapter = new MockAdapter();
    registry.register({
      id: "mock-plugin",
      name: "Mock",
      adapter,
      config: { sessionId: "session-1", allowFrom: "any", dmPolicy: "allow" },
    });

    const router = new ChannelRouter({ registry });
    const routed: string[] = [];

    const result = await router.handleMessage(
      {
        channel: "mock",
        conversationId: "conv-1",
        senderId: "user-1",
        text: "hello",
        timestamp: Date.now(),
      },
      (sessionId) => {
        routed.push(sessionId);
      }
    );

    expect(result.status).toBe("routed");
    expect(routed).toEqual(["session-1"]);
  });

  it("blocks senders not in allowFrom list", async () => {
    const registry = new ChannelRegistry();
    const adapter = new MockAdapter();
    registry.register({
      id: "mock-plugin",
      name: "Mock",
      adapter,
      config: { sessionId: "session-1", allowFrom: ["user-allow"], dmPolicy: "allow" },
    });

    const router = new ChannelRouter({ registry });
    const routed: string[] = [];

    const result = await router.handleMessage(
      {
        channel: "mock",
        conversationId: "conv-1",
        senderId: "user-blocked",
        text: "hello",
        timestamp: Date.now(),
      },
      (sessionId) => {
        routed.push(sessionId);
      }
    );

    expect(result.status).toBe("blocked");
    expect(routed).toEqual([]);
  });

  it("supports pairing flow for unknown senders", async () => {
    const registry = new ChannelRegistry();
    const adapter = new MockAdapter();
    registry.register({
      id: "mock-plugin",
      name: "Mock",
      adapter,
      config: { sessionId: "session-1", allowFrom: [], dmPolicy: "pairing" },
    });

    const router = new ChannelRouter({
      registry,
      pairing: { generateCode: () => "123456" },
    });
    const routed: string[] = [];

    const first = await router.handleMessage(
      {
        channel: "mock",
        conversationId: "conv-1",
        senderId: "user-1",
        text: "hello",
        timestamp: Date.now(),
      },
      (sessionId) => {
        routed.push(sessionId);
      }
    );

    expect(first.status).toBe("blocked");
    expect(adapter.sent[0]?.text).toContain("123456");

    const pairing = await router.handleMessage(
      {
        channel: "mock",
        conversationId: "conv-1",
        senderId: "user-1",
        text: "pair 123456",
        timestamp: Date.now(),
      },
      (sessionId) => {
        routed.push(sessionId);
      }
    );

    expect(pairing.status).toBe("paired");

    const routedResult = await router.handleMessage(
      {
        channel: "mock",
        conversationId: "conv-1",
        senderId: "user-1",
        text: "next",
        timestamp: Date.now(),
      },
      (sessionId) => {
        routed.push(sessionId);
      }
    );

    expect(routedResult.status).toBe("routed");
    expect(routed).toEqual(["session-1"]);
  });
});
