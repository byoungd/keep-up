import { computeContextHash } from "@ku0/core";
import { beforeEach, describe, expect, it } from "vitest";
import { createAnnotation } from "../../annotations/annotationSchema";
import { createEmptyDoc } from "../../crdt/crdtSchema";
import { createLoroRuntime } from "../../runtime/loroRuntime";
import { LoroDocumentFacade } from "../documentFacade";
import {
  buildSelectionAnnotationId,
  buildSelectionSpanId,
  createLoroDocumentProvider,
  createLoroGatewayRetryProviders,
} from "../loroDocumentProvider";

describe("LoroDocumentProvider", () => {
  let runtime: ReturnType<typeof createLoroRuntime>;
  let facade: LoroDocumentFacade;
  let blockId: string;

  beforeEach(() => {
    runtime = createLoroRuntime({ docId: "doc-1", peerId: "1" });
    blockId = createEmptyDoc(runtime.doc);
    runtime.commit("test:init");
    facade = new LoroDocumentFacade(runtime);
    facade.updateBlockContent({ blockId, text: "Hello world" });
  });

  it("returns span state with verified hash", async () => {
    const annotationId = "anno-1";
    createAnnotation(runtime.doc, {
      id: annotationId,
      spanList: [{ blockId, start: 0, end: 5 }],
      chain: {
        policy: { kind: "required_order", maxInterveningBlocks: 0 },
        order: [blockId],
      },
      content: "note",
      storedState: "active",
    });
    runtime.commit("test:anno");

    const provider = createLoroDocumentProvider(facade, runtime);
    const spanId = `s0-${blockId}-0-5`;
    const state = provider.getSpanState(spanId);

    expect(state?.annotation_id).toBe(annotationId);
    expect(state?.block_id).toBe(blockId);
    expect(state?.text).toBe("Hello");
    expect(state?.is_verified).toBe(true);

    const expected = await computeContextHash({
      span_id: spanId,
      block_id: blockId,
      text: "Hello",
    });
    expect(state?.context_hash).toBe(expected.hash);

    const states = provider.getSpanStates([spanId, "missing"]);
    expect(states.has(spanId)).toBe(true);
    expect(states.has("missing")).toBe(false);
  });

  it("supports selection span ids without annotations", async () => {
    const provider = createLoroDocumentProvider(facade, runtime);
    const requestId = "req-selection";
    const spanId = buildSelectionSpanId(requestId, blockId, 0, 5);
    const state = provider.getSpanState(spanId);

    expect(state?.annotation_id).toBe(buildSelectionAnnotationId(requestId));
    expect(state?.block_id).toBe(blockId);
    expect(state?.text).toBe("Hello");
    expect(state?.is_verified).toBe(true);

    const expected = await computeContextHash({
      span_id: spanId,
      block_id: blockId,
      text: "Hello",
    });
    expect(state?.context_hash).toBe(expected.hash);
  });

  it("marks span as unverified when annotation is not active", () => {
    const annotationId = "anno-2";
    createAnnotation(runtime.doc, {
      id: annotationId,
      spanList: [{ blockId, start: 0, end: 5 }],
      chain: {
        policy: { kind: "required_order", maxInterveningBlocks: 0 },
        order: [blockId],
      },
      content: "note",
      storedState: "orphan",
    });
    runtime.commit("test:anno-orphan");

    const provider = createLoroDocumentProvider(facade, runtime);
    const spanId = `s0-${blockId}-0-5`;
    const state = provider.getSpanState(spanId);

    expect(state?.annotation_id).toBe(annotationId);
    expect(state?.is_verified).toBe(false);
  });

  it("exposes retry providers for exact-hash relocation", async () => {
    const annotationId = "anno-relocate";
    createAnnotation(runtime.doc, {
      id: annotationId,
      spanList: [{ blockId, start: 0, end: 5 }],
      chain: {
        policy: { kind: "required_order", maxInterveningBlocks: 0 },
        order: [blockId],
      },
      content: "note",
      storedState: "active",
    });
    runtime.commit("test:relocate");

    const { relocationProvider } = createLoroGatewayRetryProviders(facade, runtime);
    const spanId = `s0-${blockId}-0-5`;
    const expected = await computeContextHash({
      span_id: spanId,
      block_id: blockId,
      text: "Hello",
    });

    const relocated = relocationProvider.findByContextHash(facade.docId, expected.hash);
    expect(relocated?.context_hash).toBe(expected.hash);
    expect(relocated?.block_id).toBe(blockId);
  });

  it("supports fuzzy text relocation for retry providers", () => {
    const annotationId = "anno-fuzzy";
    createAnnotation(runtime.doc, {
      id: annotationId,
      spanList: [{ blockId, start: 0, end: 5 }],
      chain: {
        policy: { kind: "required_order", maxInterveningBlocks: 0 },
        order: [blockId],
      },
      content: "note",
      storedState: "active",
    });
    runtime.commit("test:relocate-fuzzy");

    const { relocationProvider } = createLoroGatewayRetryProviders(facade, runtime);
    const relocated = relocationProvider.findByFuzzyText(facade.docId, "Hella", 0.7);

    expect(relocated?.block_id).toBe(blockId);
    expect(relocated?.text).toBe("Hello");
  });

  it("compares frontiers correctly", () => {
    const provider = createLoroDocumentProvider(facade, runtime);
    expect(provider.compareFrontiers("p1:1", "p1:1")).toBe("equal");
    expect(provider.compareFrontiers("p1:1", "p1:2")).toBe("behind");
    expect(provider.compareFrontiers("p1:2", "p1:1")).toBe("ahead");
    expect(provider.compareFrontiers("p1:2|p2:1", "p1:1|p2:2")).toBe("diverged");
  });
});
