/**
 * LFCC v0.9 RC - Integrity Module Tests
 */

import { describe, expect, it } from "vitest";
import type { CanonBlock } from "../canonicalizer/index.js";
import {
  type AnnotationForVerify,
  type ChainData,
  CheckpointScheduler,
  computeBlockDigest,
  computeChainHash,
  computeContextHash,
  computeDocumentChecksum,
  computeDocumentChecksumTier2,
  createCheckpointSchedulerState,
  DEFAULT_DEV_COMPARE_POLICY,
  type DocumentStateProvider,
  IntegrityScanner,
  recordOperation,
  runCheckpoint,
  type SpanData,
  shouldRunFullScanNow,
  shouldTriggerCheckpoint,
  verifyContextHash,
} from "../integrity/index.js";
import type { IntegrityPolicy } from "../policy/index.js";

describe("Hash Computation", () => {
  describe("computeContextHash", () => {
    it("should compute deterministic hash for span", async () => {
      const span: SpanData = {
        span_id: "span-1",
        block_id: "block-1",
        text: "Hello world",
      };

      const result1 = await computeContextHash(span);
      const result2 = await computeContextHash(span);

      expect(result1.hash).toBe(result2.hash);
      expect(result1.span_id).toBe("span-1");
      expect(result1.hash).toHaveLength(64); // SHA-256 hex
    });

    it("should produce different hashes for different text", async () => {
      const span1: SpanData = { span_id: "s1", block_id: "b1", text: "Hello" };
      const span2: SpanData = { span_id: "s1", block_id: "b1", text: "World" };

      const result1 = await computeContextHash(span1);
      const result2 = await computeContextHash(span2);

      expect(result1.hash).not.toBe(result2.hash);
    });

    it("should normalize line endings", async () => {
      const span1: SpanData = { span_id: "s1", block_id: "b1", text: "Hello\nWorld" };
      const span2: SpanData = { span_id: "s1", block_id: "b1", text: "Hello\r\nWorld" };

      const result1 = await computeContextHash(span1);
      const result2 = await computeContextHash(span2);

      expect(result1.hash).toBe(result2.hash);
    });
  });

  describe("computeChainHash", () => {
    it("should compute deterministic hash for chain", async () => {
      const chain: ChainData = {
        policy_kind: "strict_adjacency",
        max_intervening_blocks: 0,
        block_ids: ["b1", "b2", "b3"],
      };

      const result1 = await computeChainHash(chain);
      const result2 = await computeChainHash(chain);

      expect(result1.hash).toBe(result2.hash);
      expect(result1.block_ids).toEqual(["b1", "b2", "b3"]);
    });

    it("should produce different hashes for different policies", async () => {
      const chain1: ChainData = {
        policy_kind: "strict_adjacency",
        max_intervening_blocks: 0,
        block_ids: ["b1", "b2"],
      };
      const chain2: ChainData = {
        policy_kind: "bounded_gap",
        max_intervening_blocks: 2,
        block_ids: ["b1", "b2"],
      };

      const result1 = await computeChainHash(chain1);
      const result2 = await computeChainHash(chain2);

      expect(result1.hash).not.toBe(result2.hash);
    });
  });

  describe("verifyContextHash", () => {
    it("should verify matching hash", async () => {
      const span: SpanData = { span_id: "s1", block_id: "b1", text: "Test" };
      const { hash } = await computeContextHash(span);

      const isValid = await verifyContextHash(span, hash);
      expect(isValid).toBe(true);
    });

    it("should reject mismatched hash", async () => {
      const span: SpanData = { span_id: "s1", block_id: "b1", text: "Test" };

      const isValid = await verifyContextHash(span, "wrong-hash");
      expect(isValid).toBe(false);
    });
  });

  describe("document checksum", () => {
    it("should normalize text and mark order for block digest", async () => {
      const digestA = await computeBlockDigest({
        block_id: "b1",
        type: "paragraph",
        attrs: {},
        inline: [{ text: "Hello\r\nwor\u0001\u007Fld", marks: ["italic", "bold"], attrs: {} }],
        children: [],
      });
      const digestB = await computeBlockDigest({
        block_id: "b1",
        type: "paragraph",
        attrs: {},
        inline: [{ text: "Hello\nworld", marks: ["bold", "italic"], attrs: {} }],
        children: [],
      });
      expect(digestA).toBe(digestB);
    });

    it("should be sensitive to document order", async () => {
      const checksum1 = await computeDocumentChecksum({
        blocks: [
          { block_id: "root", digest: "aaa" },
          { block_id: "child", digest: "bbb" },
        ],
      });
      const checksum2 = await computeDocumentChecksum({
        blocks: [
          { block_id: "child", digest: "bbb" },
          { block_id: "root", digest: "aaa" },
        ],
      });
      expect(checksum1).not.toBe(checksum2);
    });

    it("computes tier2 checksum and block digests in document order", async () => {
      const root: CanonBlock = {
        id: "r/0",
        type: "document",
        attrs: { block_id: "root" },
        children: [
          {
            id: "r/1",
            type: "paragraph",
            attrs: { block_id: "p1" },
            children: [{ text: "Hello", marks: [], is_leaf: true }],
          },
          {
            id: "r/2",
            type: "paragraph",
            attrs: { block_id: "p2" },
            children: [{ text: "World", marks: ["bold"], is_leaf: true }],
          },
        ],
      };

      const tier2 = await computeDocumentChecksumTier2(root);
      const tier1 = await computeDocumentChecksum({ blocks: tier2.blocks });

      expect(tier2.blocks.map((b) => b.block_id)).toEqual(["root", "p1", "p2"]);
      expect(tier2.checksum).toBe(tier1);
    });

    it("throws when block_id is missing during tier2 computation", async () => {
      const root: CanonBlock = {
        id: "r/0",
        type: "document",
        attrs: {},
        children: [],
      };

      await expect(computeDocumentChecksumTier2(root)).rejects.toThrow("block_id");
    });
  });
});

describe("Checkpoint Scheduler", () => {
  const defaultPolicy: IntegrityPolicy = {
    version: "v3",
    context_hash: { enabled: true, mode: "lazy_verify", debounce_ms: 100 },
    chain_hash: { enabled: true, mode: "eager" },
    document_checksum: {
      enabled: true,
      mode: "lazy_verify",
      strategy: "two_tier",
      algorithm: "LFCC_DOC_V1",
    },
    checkpoint: { enabled: true, every_ops: 5, every_ms: 1000 },
  };

  describe("shouldTriggerCheckpoint", () => {
    it("should trigger by ops count", () => {
      const state = { ops_since_last: 5, last_checkpoint_ms: Date.now(), pending: false };
      expect(shouldTriggerCheckpoint(state, defaultPolicy)).toBe(true);
    });

    it("should trigger by time", () => {
      const state = {
        ops_since_last: 1,
        last_checkpoint_ms: Date.now() - 2000,
        pending: false,
      };
      expect(shouldTriggerCheckpoint(state, defaultPolicy)).toBe(true);
    });

    it("should not trigger when disabled", () => {
      const disabledPolicy: IntegrityPolicy = {
        ...defaultPolicy,
        checkpoint: { enabled: false, every_ops: 5, every_ms: 1000 },
      };
      const state = { ops_since_last: 100, last_checkpoint_ms: 0, pending: false };
      expect(shouldTriggerCheckpoint(state, disabledPolicy)).toBe(false);
    });
  });

  describe("recordOperation", () => {
    it("should increment ops count", () => {
      const state = createCheckpointSchedulerState();
      const { state: newState } = recordOperation(state, defaultPolicy);
      expect(newState.ops_since_last).toBe(1);
    });

    it("should signal checkpoint when threshold reached", () => {
      let state = createCheckpointSchedulerState();
      for (let i = 0; i < 4; i++) {
        const result = recordOperation(state, defaultPolicy);
        state = result.state;
        expect(result.shouldCheckpoint).toBe(false);
      }
      const { shouldCheckpoint } = recordOperation(state, defaultPolicy);
      expect(shouldCheckpoint).toBe(true);
    });
  });

  describe("CheckpointScheduler high priority", () => {
    it("should bypass debounce for high-priority trigger", async () => {
      let calls = 0;
      const scheduler = new CheckpointScheduler(defaultPolicy, async () => {
        calls++;
      });
      scheduler.triggerHighPriority();
      await Promise.resolve(); // allow microtask to run
      expect(calls).toBeGreaterThan(0);
    });

    it("should route TRIGGER_VERIFY priority correctly", async () => {
      let normalCalls = 0;
      const schedulerNormal = new CheckpointScheduler(defaultPolicy, async () => {
        normalCalls++;
      });
      schedulerNormal.triggerVerify("normal");
      await new Promise((r) => setTimeout(r, 0));
      expect(normalCalls).toBe(0); // debounced path not yet fired

      let highCalls = 0;
      const schedulerHigh = new CheckpointScheduler(defaultPolicy, async () => {
        highCalls++;
      });
      schedulerHigh.triggerVerify("high");
      await new Promise((r) => setTimeout(r, 0));
      expect(highCalls).toBeGreaterThan(0);
    });
  });

  describe("runCheckpoint", () => {
    it("should verify annotations and report results", async () => {
      const span: SpanData = { span_id: "s1", block_id: "b1", text: "Hello" };
      const { hash } = await computeContextHash(span);

      const annotations: AnnotationForVerify[] = [
        {
          anno_id: "a1",
          spans: [{ span_id: "s1", block_id: "b1", text: "Hello", expected_context_hash: hash }],
          chain: {
            block_ids: ["b1"],
            policy_kind: "strict_adjacency",
            max_intervening_blocks: 0,
            expected_chain_hash: null,
          },
        },
      ];

      const result = await runCheckpoint(annotations, defaultPolicy);
      expect(result.spans_verified).toBe(1);
      expect(result.spans_failed).toBe(0);
      expect(result.failures).toHaveLength(0);
    });

    it("should detect hash mismatch", async () => {
      const annotations: AnnotationForVerify[] = [
        {
          anno_id: "a1",
          spans: [
            {
              span_id: "s1",
              block_id: "b1",
              text: "Changed text",
              expected_context_hash: "old-hash-that-wont-match",
            },
          ],
          chain: {
            block_ids: ["b1"],
            policy_kind: "strict_adjacency",
            max_intervening_blocks: 0,
            expected_chain_hash: null,
          },
        },
      ];

      const result = await runCheckpoint(annotations, defaultPolicy);
      expect(result.spans_failed).toBe(1);
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0].kind).toBe("context_hash_mismatch");
    });
  });
});

describe("Integrity Scanner", () => {
  const createMockProvider = (): DocumentStateProvider => ({
    getAnnotations: () => [],
    getAnnotationsInBlocks: () => [],
    getSpanText: () => null,
    getBlockOrder: () => [],
  });

  describe("shouldRunFullScanNow", () => {
    it("should run full scan for small documents", () => {
      expect(
        shouldRunFullScanNow({
          blockCount: 50,
          structuralOpsSinceLastFullScan: 0,
          idleMs: 0,
          policy: DEFAULT_DEV_COMPARE_POLICY,
        })
      ).toBe(true);
    });

    it("should run full scan after structural ops threshold", () => {
      expect(
        shouldRunFullScanNow({
          blockCount: 500,
          structuralOpsSinceLastFullScan: 10,
          idleMs: 0,
          policy: DEFAULT_DEV_COMPARE_POLICY,
        })
      ).toBe(true);
    });

    it("should run full scan on idle", () => {
      expect(
        shouldRunFullScanNow({
          blockCount: 500,
          structuralOpsSinceLastFullScan: 0,
          idleMs: 35000,
          policy: DEFAULT_DEV_COMPARE_POLICY,
        })
      ).toBe(true);
    });

    it("should not run full scan for large active documents", () => {
      expect(
        shouldRunFullScanNow({
          blockCount: 500,
          structuralOpsSinceLastFullScan: 2,
          idleMs: 1000,
          policy: DEFAULT_DEV_COMPARE_POLICY,
        })
      ).toBe(false);
    });
  });

  describe("IntegrityScanner", () => {
    it("should perform dirty scan", async () => {
      const provider = createMockProvider();
      const scanner = new IntegrityScanner(provider, DEFAULT_DEV_COMPARE_POLICY);

      const mismatches = await scanner.dirtyScan({
        opCodes: ["OP_TEXT_EDIT"],
        touchedBlocks: ["b1"],
      });

      expect(mismatches).toEqual([]);
    });

    it("should perform full scan", async () => {
      const provider = createMockProvider();
      const scanner = new IntegrityScanner(provider, DEFAULT_DEV_COMPARE_POLICY);

      const mismatches = await scanner.fullScan();
      expect(mismatches).toEqual([]);
    });
  });
});
