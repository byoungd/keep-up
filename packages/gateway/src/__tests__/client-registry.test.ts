import { describe, expect, it } from "vitest";
import { GatewayClientRegistry, matchPattern } from "../clients/client-registry";

class MockSocket {
  readonly sent: string[] = [];
  closed = false;

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closed = true;
  }
}

describe("GatewayClientRegistry", () => {
  it("enforces subscription limits and matches wildcard patterns", () => {
    const registry = new GatewayClientRegistry({ maxSubscriptions: 1 });
    const socket = new MockSocket();
    registry.registerClient(socket, { clientId: "client-1", authenticated: true });

    const result = registry.addSubscriptions("client-1", ["presence.*", "tool.called"]);
    expect(result.added).toEqual(["presence.*"]);
    expect(result.rejected).toEqual(["tool.called"]);

    const subscribers = registry.listSubscribers("presence.tick");
    expect(subscribers).toHaveLength(1);
    expect(matchPattern("presence.*", "presence.tick")).toBe(true);
    expect(matchPattern("presence.*", "tool.called")).toBe(false);
  });
});
