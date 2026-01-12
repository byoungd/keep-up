import { applyOperation, createEnhancedDocument, createMessageBlock } from "@keepup/lfcc-bridge";
import { describe, expect, it } from "vitest";
import { applyRetention, sanitizeMarkdown } from "../useChatPersistence";

describe("applyRetention", () => {
  it("trims blocks when exceeding retention limits", () => {
    let doc = createEnhancedDocument("chat");

    // Add 500 message blocks
    for (let idx = 0; idx < 500; idx++) {
      const block = createMessageBlock(idx % 2 === 0 ? "user" : "assistant", `message-${idx}`);
      doc = applyOperation(doc, { type: "INSERT_BLOCK", blockId: block.id, block });
    }

    const result = applyRetention({ doc, model: "test" });
    expect(result.doc.blocks.length).toBeLessThanOrEqual(200);
  });
});

describe("sanitizeMarkdown", () => {
  it("strips script tags and unsafe links", () => {
    const input = "<script>alert(1)</script> [x](javascript:alert(1))";
    const output = sanitizeMarkdown(input);
    expect(output).not.toContain("script");
    expect(output).toContain("(#)");
  });
});
