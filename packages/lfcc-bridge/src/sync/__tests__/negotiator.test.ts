import { DEFAULT_POLICY_MANIFEST } from "@ku0/core";
import { describe, expect, it } from "vitest";

import { createNegotiator } from "../negotiator";

describe("Negotiator", () => {
  it("rejects incompatible protocol versions", () => {
    const manifest = JSON.parse(JSON.stringify(DEFAULT_POLICY_MANIFEST));
    const local = createNegotiator(manifest, "local", "0.9.4");
    const remote = createNegotiator(manifest, "remote", "0.9.3");

    const response = local.processHello(remote.createHello());

    expect(response.type).toBe("REJECT");
    if (response.type === "REJECT") {
      expect(response.reason).toBe("PROTOCOL_VERSION_INCOMPATIBLE");
    }
  });
});
