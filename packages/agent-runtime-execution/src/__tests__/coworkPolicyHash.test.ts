import type { CoworkPolicyConfig } from "@ku0/agent-runtime-core";
import { computeCoworkPolicyHash } from "@ku0/agent-runtime-core";
import { describe, expect, it } from "vitest";

describe("Cowork policy hashing", () => {
  it("produces stable hashes regardless of key ordering", async () => {
    const config: CoworkPolicyConfig = {
      version: "1.0",
      defaults: { fallback: "deny" },
      rules: [],
    };

    const reordered = {
      defaults: { fallback: "deny" },
      rules: [],
      version: "1.0",
    } as CoworkPolicyConfig;

    const hash1 = await computeCoworkPolicyHash(config);
    const hash2 = await computeCoworkPolicyHash(reordered);
    const hash3 = await computeCoworkPolicyHash(config);

    expect(hash1).toBe(hash2);
    expect(hash1).toBe(hash3);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/i);
  });
});
