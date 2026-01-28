import { describe, expect, it } from "vitest";
import { ChannelRegistry } from "../channels/registry";
import type { ChannelMessage, ChannelTarget } from "../channels/types";
import { ChannelRouter } from "../routing/router";

function extractCode(message: string): string | null {
  const match = message.match(/code:\s*([0-9]{4,12})/i);
  return match?.[1] ?? null;
}

describe("ChannelRouter", () => {
  it("handles pairing flow and routes after pairing", async () => {
    const sent: string[] = [];
    const registry = new ChannelRegistry();
    registry.register({
      id: "sms",
      name: "SMS",
      config: { dmPolicy: "pairing", allowFrom: "any", sessionKey: { sessionId: "s1" } },
      sendMessage: async (_target: ChannelTarget, text: string) => {
        sent.push(text);
      },
    });

    const router = new ChannelRouter({
      registry,
      defaultSessionKey: { sessionId: "s1" },
    });

    let routed = 0;
    const route = async () => {
      routed += 1;
    };

    const message: ChannelMessage = {
      channelId: "sms",
      conversationId: "dm-1",
      peerId: "user-1",
      text: "hello",
      timestamp: 1,
    };

    const first = await router.handleMessage(message, route);
    expect(first.status).toBe("blocked");
    expect(sent[0]).toContain("Pairing required");

    const code = extractCode(sent[0]);
    if (!code) {
      throw new Error("Missing pairing code in test");
    }

    const confirm = await router.handleMessage({ ...message, text: `pair ${code}` }, route);
    expect(confirm.status).toBe("paired");

    const routedResult = await router.handleMessage({ ...message, text: "after" }, route);
    expect(routedResult.status).toBe("routed");
    expect(routed).toBe(1);
  });
});
