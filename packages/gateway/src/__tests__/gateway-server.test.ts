import { describe, expect, it } from "vitest";
import { ChannelRegistry } from "../channels/registry";
import type { GatewayWebSocketLike } from "../clients/client-registry";
import { GatewayServer } from "../server/gateway-server";

class MockSocket implements GatewayWebSocketLike {
  readonly sent: string[] = [];
  closed = false;

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closed = true;
  }
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("GatewayServer", () => {
  it("handles ping, auth, subscribe, and event broadcast", async () => {
    const server = new GatewayServer({ auth: { mode: "token", token: "secret" } });
    const socket = new MockSocket();
    const handle = server.handleConnection(socket, { clientId: "client-1" });

    handle.onMessage(JSON.stringify({ id: 1, method: "ping" }));
    await tick();

    handle.onMessage(
      JSON.stringify({ id: 2, method: "subscribe", params: { patterns: ["presence.*"] } })
    );
    await tick();

    handle.onMessage(JSON.stringify({ id: 3, method: "auth", params: { token: "secret" } }));
    await tick();

    handle.onMessage(
      JSON.stringify({ id: 4, method: "subscribe", params: { patterns: ["presence.*"] } })
    );
    await tick();

    server.broadcastEvent("presence.tick", { ok: true });

    const messages = socket.sent.map((payload) => JSON.parse(payload) as Record<string, unknown>);
    const ping = messages.find((msg) => msg.id === 1) as { result?: { pong?: boolean } };
    expect(ping?.result?.pong).toBe(true);

    const unauthorized = messages.find((msg) => msg.id === 2) as { error?: { code?: string } };
    expect(unauthorized?.error?.code).toBe("UNAUTHORIZED");

    const subscribed = messages.find((msg) => msg.id === 4) as { result?: { added?: string[] } };
    expect(subscribed?.result?.added).toEqual(["presence.*"]);

    const event = messages.find((msg) => msg.event === "presence.tick");
    expect(event).toBeTruthy();
  });

  it("returns channel status via channel.list", async () => {
    const registry = new ChannelRegistry();
    registry.register({ id: "web", name: "Web" });
    const server = new GatewayServer({ channelRegistry: registry });
    const socket = new MockSocket();
    const handle = server.handleConnection(socket, { clientId: "client-2" });

    handle.onMessage(JSON.stringify({ id: "channels", method: "channel.list" }));
    await tick();

    const messages = socket.sent.map((payload) => JSON.parse(payload) as Record<string, unknown>);
    const response = messages.find((msg) => msg.id === "channels") as {
      result?: { channels?: Array<{ id: string }> };
    };

    expect(response?.result?.channels?.[0]?.id).toBe("web");
  });
});
