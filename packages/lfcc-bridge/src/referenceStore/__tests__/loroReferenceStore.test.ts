import { documentId } from "@ku0/core";
import { describe, expect, it } from "vitest";
import { LoroRuntime } from "../../runtime/loroRuntime";
import { LoroReferenceStore, type ReferenceVerificationProvider } from "../loroReferenceStore";

function createRecord(refId: string, requestId: string) {
  return {
    ref_id: refId,
    ref_type: "citation" as const,
    source: {
      doc_id: documentId("doc-a"),
      block_id: "block-a",
      start: { anchor: "anchor-start", bias: "right" as const },
      end: { anchor: "anchor-end", bias: "left" as const },
      if_match_context_hash: "hash-a",
    },
    target: {
      doc_id: documentId("doc-b"),
      block_id: "block-b",
      anchor: { anchor: "anchor-target", bias: "right" as const },
    },
    created_at_ms: 1_700_000_000_000,
    created_by: { agent_id: "agent-1", request_id: requestId },
    v: 1 as const,
  };
}

function createStore(policyDomainId = "policy-1") {
  const runtime = new LoroRuntime({ docId: `lfcc_ref_store::${policyDomainId}` });
  let shouldVerify = true;
  const verifier: ReferenceVerificationProvider = {
    verifyReference() {
      return shouldVerify ? { ok: true } : { ok: false, code: "REF_ANCHOR_UNRESOLVED" };
    },
  };
  const store = new LoroReferenceStore({ policyDomainId, runtime, verifier });
  return {
    store,
    runtime,
    setVerification(value: boolean) {
      shouldVerify = value;
    },
  };
}

describe("LoroReferenceStore", () => {
  it("creates, queries, and updates references", async () => {
    const { store, setVerification } = createStore();
    const record = createRecord("ref-1", "req-1");

    await store.createReference(record);
    await store.createReference(record);

    const entry = store.getReference("ref-1");
    expect(entry?.status).toBe("active");
    expect(store.getReferencesFromDoc(record.source.doc_id)).toHaveLength(1);
    expect(store.getReferencesToDoc(record.target.doc_id)).toHaveLength(1);

    setVerification(false);
    const verified = await store.refreshVerification("ref-1");
    expect(verified).toBe(false);
    expect(store.getReference("ref-1")?.status).toBe("orphan");

    await store.updateReferenceStatus("ref-1", "deleted", "cleanup");
    expect(store.getReference("ref-1")?.status).toBe("deleted");
  });

  it("exports and imports updates", async () => {
    const storeA = createStore("policy-2");
    const storeB = createStore("policy-2");

    const record = createRecord("ref-2", "req-2");
    await storeA.store.createReference(record);

    const snapshot = storeA.store.exportUpdates();
    storeB.store.importUpdates(snapshot);
    expect(storeB.store.getReference("ref-2")?.status).toBe("active");

    const frontier = storeB.store.getFrontier();
    await storeA.store.updateReferenceStatus("ref-2", "orphan", "verify_failed");

    const updates = storeA.store.exportUpdates(frontier);
    storeB.store.importUpdates(updates);
    expect(storeB.store.getReference("ref-2")?.status).toBe("orphan");
  });

  it("rejects idempotency conflicts with different record content", async () => {
    const { store } = createStore();
    const record = createRecord("ref-3", "req-3");

    await store.createReference(record);

    const mutated = {
      ...record,
      target: {
        ...record.target,
        block_id: "block-c",
      },
    };

    try {
      await store.createReference(mutated);
      throw new Error("Expected reference creation to fail");
    } catch (error) {
      expect(error).toMatchObject({ code: "REF_ALREADY_EXISTS" });
    }
  });
});
