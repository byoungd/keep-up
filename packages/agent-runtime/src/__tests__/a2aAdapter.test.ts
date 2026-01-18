import { describe, expect, it } from "vitest";
import { A2AMessageBusAdapter } from "../events/a2a";
import { createMessageBus } from "../events/messageBus";

describe("A2AMessageBusAdapter", () => {
  it("routes request/response envelopes", async () => {
    const bus = createMessageBus();
    const adapter = new A2AMessageBusAdapter(bus);

    adapter.registerAgent("agent-b", (envelope) => {
      if (envelope.type !== "request") {
        return undefined;
      }
      return { success: true, output: "ok", echo: envelope.payload };
    });

    const response = await adapter.request("agent-a", "agent-b", { task: "ping" });
    expect(response.type).toBe("response");
    expect(response.payload).toEqual({ success: true, output: "ok", echo: { task: "ping" } });
  });

  it("tracks capability broadcasts", async () => {
    const bus = createMessageBus();
    const adapter = new A2AMessageBusAdapter(bus);

    adapter.broadcastCapabilities("agent-a", ["researcher", "coder"]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const entry = adapter.capabilities.get("agent-a");
    expect(entry?.capabilities).toEqual(["researcher", "coder"]);
  });
});
