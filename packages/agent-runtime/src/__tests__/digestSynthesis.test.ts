import { describe, expect, it } from "vitest";
import {
  createAgentManager,
  createMockLLM,
  createToolRegistry,
  type DigestSourceItem,
  runDigestSynthesis,
  VerifierAgent,
} from "../index";

describe("Digest synthesis pipeline", () => {
  it("produces verified digest cards with citations", async () => {
    const llm = createMockLLM();
    llm.addResponse("digestmap item-1", {
      content: JSON.stringify({
        summary: "Alpha launched a new battery on Tuesday.",
        claims: ["Alpha launched a new battery on Tuesday."],
        topics: ["battery", "energy"],
        citations: [{ itemId: "item-1", evidence: "Alpha launched a new battery on Tuesday." }],
      }),
      finishReason: "stop",
    });
    llm.addResponse("digestreduce cluster-1", {
      content: JSON.stringify({
        title: "Battery launch",
        summary: "Alpha launched a new battery on Tuesday.",
        whyItMatters: ["It could improve energy storage."],
        topics: ["battery"],
        sourceItemIds: ["item-1"],
        citations: [{ itemId: "item-1", evidence: "Alpha launched a new battery on Tuesday." }],
      }),
      finishReason: "stop",
    });
    llm.addResponse("verifyclaim", {
      content: JSON.stringify({
        verified: true,
        evidence: "Alpha launched a new battery on Tuesday.",
        sourceItemId: "item-1",
      }),
      finishReason: "stop",
    });

    const registry = createToolRegistry();
    const manager = createAgentManager({ llm, registry });
    const verifier = new VerifierAgent(manager);

    const items: DigestSourceItem[] = [
      {
        id: "item-1",
        title: "Alpha unveils new battery",
        content: "Alpha launched a new battery on Tuesday. The product targets EVs.",
        sourceName: "TechWire",
      },
    ];

    const output = await runDigestSynthesis(
      { items },
      { agentManager: manager, verifier },
      {
        executeTool: async () => {
          throw new Error("Tool execution not expected in this test");
        },
      }
    );

    expect(output.cards).toHaveLength(1);
    expect(output.rejectedCards).toHaveLength(0);
    expect(output.cards[0]?.verified).toBe(true);
    expect(output.cards[0]?.citations[0]?.evidence).toContain("Alpha launched");
    expect(output.cards[0]?.verification[0]?.verified).toBe(true);
  });

  it("rejects cards when no sources are available", async () => {
    const llm = createMockLLM();
    llm.addResponse("digestmap item-2", {
      content: JSON.stringify({
        summary: "Beta released a new SDK.",
        claims: ["Beta released a new SDK."],
        topics: ["sdk"],
        citations: [{ itemId: "item-2", evidence: "Beta released a new SDK." }],
      }),
      finishReason: "stop",
    });
    llm.addResponse("digestreduce cluster-1", {
      content: JSON.stringify({
        title: "SDK release",
        summary: "Beta released a new SDK.",
        whyItMatters: ["Developers can ship faster."],
        topics: ["sdk"],
        sourceItemIds: ["missing-item"],
        citations: [{ itemId: "missing-item", evidence: "Beta released a new SDK." }],
      }),
      finishReason: "stop",
    });

    const registry = createToolRegistry();
    const manager = createAgentManager({ llm, registry });
    const verifier = new VerifierAgent(manager);

    const items: DigestSourceItem[] = [
      {
        id: "item-2",
        title: "Beta SDK launch",
        content: "Beta released a new SDK for developers.",
        sourceName: "DevWire",
      },
    ];

    const output = await runDigestSynthesis(
      { items },
      { agentManager: manager, verifier },
      {
        executeTool: async () => {
          throw new Error("Tool execution not expected in this test");
        },
      }
    );

    expect(output.cards).toHaveLength(0);
    expect(output.rejectedCards).toHaveLength(1);
    expect(output.rejectedCards[0]?.verified).toBe(false);
    expect(output.rejectedCards[0]?.verification[0]?.reason).toContain("No sources");
  });
});
