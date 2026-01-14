// @vitest-environment jsdom
import { computeContextHash, gateway } from "@ku0/core";
import { describe, expect, it } from "vitest";
import { EditorAdapterPM } from "../../adapters/editorAdapterPM";
import { BridgeController } from "../../bridge/bridgeController";
import { createEmptyDoc } from "../../crdt/crdtSchema";
import { createLoroRuntime } from "../../runtime/loroRuntime";
import { LoroDocumentFacade } from "../documentFacade";
import {
  buildSelectionAnnotationId,
  buildSelectionSpanId,
  createLoroAIGateway,
  createLoroDocumentProvider,
} from "../loroDocumentProvider";

function setupGateway() {
  const runtime = createLoroRuntime({ docId: "doc-1", peerId: "1" });
  const blockId = createEmptyDoc(runtime.doc);
  runtime.commit("test:init");
  const facade = new LoroDocumentFacade(runtime);

  const bridge = new BridgeController({
    runtime,
    adapter: new EditorAdapterPM(),
  });
  const container = document.createElement("div");
  const view = bridge.createView(container);
  view.dispatch(view.state.tr.insertText("Hello world", 1));

  const provider = createLoroDocumentProvider(facade, runtime);
  const gatewayInstance = createLoroAIGateway(facade, runtime);

  return { runtime, facade, bridge, view, blockId, provider, gatewayInstance };
}

describe("Loro AI Gateway integration", () => {
  it("builds an apply_plan and applies via bridge", async () => {
    const { facade, bridge, view, blockId, provider, gatewayInstance } = setupGateway();
    const requestId = "req-apply";
    const spanId = buildSelectionSpanId(requestId, blockId, 0, 5);
    const { hash } = await computeContextHash({
      span_id: spanId,
      block_id: blockId,
      text: "Hello",
    });

    const request = gateway.createGatewayRequest({
      docId: facade.docId,
      docFrontierTag: provider.getFrontierTag(),
      targetSpans: [
        {
          annotation_id: buildSelectionAnnotationId(requestId),
          span_id: spanId,
          if_match_context_hash: hash,
        },
      ],
      instructions: "Replace greeting",
      format: "html",
      payload: "Hi",
      requestId,
      clientRequestId: requestId,
      agentId: "test-agent",
    });

    const result = await gatewayInstance.processRequest(request);
    expect(gateway.isGatewaySuccess(result)).toBe(true);
    if (!gateway.isGatewaySuccess(result)) {
      throw new Error("Expected gateway success response");
    }
    const applyPlan = result.apply_plan;
    expect(applyPlan).toBeDefined();
    if (!applyPlan) {
      throw new Error("Expected apply_plan in gateway response");
    }

    const applyResult = await bridge.applyAIGatewayPlan({
      plan: applyPlan,
      metadata: { requestId, agentId: "test-agent" },
    });
    expect(applyResult.success).toBe(true);
    expect(view.state.doc.textContent).toBe("Hi world");
  });

  it("returns 409 on hash mismatch", async () => {
    const { facade, blockId, provider, gatewayInstance } = setupGateway();
    const requestId = "req-conflict";
    const spanId = buildSelectionSpanId(requestId, blockId, 0, 5);

    const request = gateway.createGatewayRequest({
      docId: facade.docId,
      docFrontierTag: provider.getFrontierTag(),
      targetSpans: [
        {
          annotation_id: buildSelectionAnnotationId(requestId),
          span_id: spanId,
          if_match_context_hash: "wrong-hash",
        },
      ],
      instructions: "Replace greeting",
      format: "html",
      payload: "Hi",
      requestId,
      clientRequestId: requestId,
      agentId: "test-agent",
    });

    const result = await gatewayInstance.processRequest(request);
    expect(gateway.isGateway409(result)).toBe(true);
    expect(result.reason).toBe("hash_mismatch");
  });
});
