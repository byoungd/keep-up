import { describe, expect, it } from "vitest";
import { createAgentManager, createMockLLM, createToolRegistry, VerifierAgent } from "../index";

describe("VerifierAgent", () => {
  it("fails closed when verifier output omits boolean flag", async () => {
    const llm = createMockLLM();
    llm.addResponse("verifyclaim", {
      content: JSON.stringify({
        evidence: "Alpha launched a new battery on Tuesday.",
        sourceItemId: "item-1",
      }),
      finishReason: "stop",
    });

    const registry = createToolRegistry();
    const manager = createAgentManager({ llm, registry });
    const verifier = new VerifierAgent(manager);

    const result = await verifier.verifyClaim({
      claim: "Alpha launched a new battery on Tuesday.",
      sources: [
        {
          id: "item-1",
          title: "Alpha unveils new battery",
          content: "Alpha launched a new battery on Tuesday. The product targets EVs.",
        },
      ],
    });

    expect(result.verified).toBe(false);
    expect(result.reason).toContain("missing boolean");
  });
});
