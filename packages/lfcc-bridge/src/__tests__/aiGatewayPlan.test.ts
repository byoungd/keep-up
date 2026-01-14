// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import type { CanonNode } from "@ku0/core";
import { EditorAdapterPM } from "../adapters/editorAdapterPM";
import { BridgeController } from "../bridge/bridgeController";
import { createLoroRuntime } from "../runtime/loroRuntime";
import {
  AI_GATEWAY_AGENT_ID,
  AI_GATEWAY_META,
  AI_GATEWAY_REQUEST_ID,
} from "../security/aiGatewayWrite";

function setupBridgeWithText(text: string) {
  const runtime = createLoroRuntime({ peerId: "1" });
  const bridge = new BridgeController({
    runtime,
    adapter: new EditorAdapterPM(),
  });
  const container = document.createElement("div");
  const view = bridge.createView(container);

  const insertTr = view.state.tr.insertText(text, 1);
  view.dispatch(insertTr);

  const firstBlock = view.state.doc.firstChild;
  const blockId = firstBlock?.attrs.block_id as string;

  return { bridge, view, blockId };
}

describe("BridgeController.applyAIGatewayPlan", () => {
  it("rejects missing metadata", async () => {
    const { bridge, blockId } = setupBridgeWithText("Hello world");
    const plan = {
      operations: [
        {
          type: "replace" as const,
          span_id: `s0-${blockId}-0-5`,
          content: {
            id: "r/0",
            type: "paragraph",
            attrs: {},
            children: [{ text: "Hi", marks: [], is_leaf: true }],
          },
        },
      ],
      affected_block_ids: [blockId],
      estimated_size_bytes: 0,
    };

    const result = await bridge.applyAIGatewayPlan({
      plan,
      metadata: { requestId: "", agentId: "" },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("requestId");
  });

  it("applies canonical replacement with gateway metadata", async () => {
    const { bridge, view, blockId } = setupBridgeWithText("Hello world");
    const canon: CanonNode = {
      id: "r/0",
      type: "paragraph",
      attrs: {},
      children: [{ text: "Hi", marks: [], is_leaf: true }],
    };
    const plan = {
      operations: [
        {
          type: "replace" as const,
          span_id: `s0-${blockId}-0-5`,
          content: canon,
        },
      ],
      affected_block_ids: [blockId],
      estimated_size_bytes: 0,
    };

    const result = await bridge.applyAIGatewayPlan({
      plan,
      metadata: { requestId: "req-1", agentId: "agent-1" },
    });

    expect(result.success).toBe(true);
    expect(view.state.doc.textContent).toBe("Hi world");
    expect(result.transaction?.getMeta(AI_GATEWAY_META)).toBe(true);
    expect(result.transaction?.getMeta(AI_GATEWAY_REQUEST_ID)).toBe("req-1");
    expect(result.transaction?.getMeta(AI_GATEWAY_AGENT_ID)).toBe("agent-1");
  });
});
