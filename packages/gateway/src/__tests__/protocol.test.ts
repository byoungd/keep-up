import { describe, expect, it } from "vitest";
import { createGatewayEvent, isGatewayRequest } from "../protocol/envelope";

describe("gateway protocol", () => {
  it("detects request envelopes", () => {
    expect(isGatewayRequest({ id: 1, method: "ping" })).toBe(true);
    expect(isGatewayRequest({ id: "a", method: "ping" })).toBe(true);
    expect(isGatewayRequest({ method: "ping" })).toBe(false);
    expect(isGatewayRequest({ id: 1 })).toBe(false);
  });

  it("creates event envelopes", () => {
    const event = createGatewayEvent("presence.tick", { ok: true }, 123);
    expect(event).toEqual({ event: "presence.tick", payload: { ok: true }, timestamp: 123 });
  });
});
