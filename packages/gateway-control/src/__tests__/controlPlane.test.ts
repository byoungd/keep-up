import { createEventBus } from "@ku0/agent-runtime-control";
import { describe, expect, it } from "vitest";
import { GatewayControlServer } from "../controlPlane/server";
import type { GatewayWebSocketLike } from "../controlPlane/types";

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

describe("GatewayControlServer", () => {
  it("subscribes clients and forwards events", () => {
    const eventBus = createEventBus();
    const server = new GatewayControlServer({ eventBus });
    const socket = new MockSocket();
    const handle = server.handleConnection(socket, { clientId: "client-1" });

    handle.onMessage(
      JSON.stringify({
        type: "subscribe",
        patterns: ["tool:called"],
      })
    );

    eventBus.emitRaw("tool:called", { toolName: "bash", args: {} });

    const messages = socket.sent.map((payload) => JSON.parse(payload) as { type: string });
    expect(messages.some((msg) => msg.type === "welcome")).toBe(true);
    expect(messages.some((msg) => msg.type === "subscribed")).toBe(true);
    expect(messages.some((msg) => msg.type === "event")).toBe(true);
  });

  it("allows publish when enabled", () => {
    const eventBus = createEventBus();
    const server = new GatewayControlServer({ eventBus, allowPublish: true });
    const socket = new MockSocket();
    const handle = server.handleConnection(socket, { clientId: "client-2" });

    const events: string[] = [];
    eventBus.subscribe("custom:event", (event) => {
      events.push(event.type);
    });

    handle.onMessage(
      JSON.stringify({
        type: "publish",
        event: {
          type: "custom:event",
          payload: { ok: true },
        },
      })
    );

    expect(events).toEqual(["custom:event"]);
  });
});
