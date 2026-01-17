/**
 * LFCC v0.9 RC - DevTools Tests
 */

import { describe, expect, it } from "vitest";
import type { CanonBlock } from "../canonicalizer/index.js";
import {
  compareCanonTrees,
  compareDirtyVsFull,
  createBugReportTemplate,
  createSamplingState,
  formatScanReport,
  generateFullScanReport,
  PerformanceTracker,
  recordStructuralOp,
  resetAfterFullScan,
  selectSampleBlocks,
} from "../devtools/index.js";
import type { CompareMismatch } from "../integrity/index.js";
import { DEFAULT_DEV_COMPARE_POLICY } from "../integrity/index.js";

describe("DevTools Compare Harness", () => {
  describe("createSamplingState", () => {
    it("should create initial state with seed", () => {
      const state = createSamplingState(12345);
      expect(state.seed).toBe(12345);
      expect(state.coverage_map.size).toBe(0);
      expect(state.total_samples).toBe(0);
    });

    it("should use current time as default seed", () => {
      const before = Date.now();
      const state = createSamplingState();
      const after = Date.now();
      expect(state.seed).toBeGreaterThanOrEqual(before);
      expect(state.seed).toBeLessThanOrEqual(after);
    });
  });

  describe("selectSampleBlocks", () => {
    it("should return all blocks for small documents", () => {
      const state = createSamplingState(1);
      const blocks = ["b1", "b2", "b3"];
      const { blockIds } = selectSampleBlocks(blocks, state, DEFAULT_DEV_COMPARE_POLICY);
      expect(blockIds).toEqual(blocks);
    });

    it("should sample subset for large documents", () => {
      const state = createSamplingState(1);
      const blocks = Array.from({ length: 200 }, (_, i) => `b${i}`);
      const { blockIds, state: newState } = selectSampleBlocks(
        blocks,
        state,
        DEFAULT_DEV_COMPARE_POLICY
      );

      expect(blockIds.length).toBeLessThan(blocks.length);
      expect(blockIds.length).toBeGreaterThan(0);
      expect(newState.total_samples).toBe(1);
    });

    it("should update coverage map", () => {
      const state = createSamplingState(1);
      const blocks = Array.from({ length: 200 }, (_, i) => `b${i}`);

      const { state: state1 } = selectSampleBlocks(blocks, state, DEFAULT_DEV_COMPARE_POLICY);
      expect(state1.coverage_map.size).toBeGreaterThan(0);
    });
  });

  describe("recordStructuralOp", () => {
    it("should increment structural ops counter", () => {
      const state = createSamplingState();
      const newState = recordStructuralOp(state);
      expect(newState.structural_ops_since_full).toBe(1);
    });
  });

  describe("resetAfterFullScan", () => {
    it("should reset counters", () => {
      let state = createSamplingState();
      state = recordStructuralOp(state);
      state = recordStructuralOp(state);

      const reset = resetAfterFullScan(state);
      expect(reset.structural_ops_since_full).toBe(0);
      expect(reset.last_full_scan_ms).toBeGreaterThan(0);
    });
  });

  describe("compareDirtyVsFull", () => {
    it("should find mismatches missed by dirty scan", () => {
      const dirtyMismatches: CompareMismatch[] = [
        { kind: "hash_mismatch", anno_id: "a1", span_id: "s1", detail: "test" },
      ];
      const fullMismatches: CompareMismatch[] = [
        { kind: "hash_mismatch", anno_id: "a1", span_id: "s1", detail: "test" },
        { kind: "hash_mismatch", anno_id: "a2", span_id: "s2", detail: "missed" },
      ];

      const missed = compareDirtyVsFull(dirtyMismatches, fullMismatches);
      expect(missed).toHaveLength(1);
      expect(missed[0].anno_id).toBe("a2");
    });
  });

  describe("generateFullScanReport", () => {
    it("should generate complete report", () => {
      const report = generateFullScanReport(
        Date.now() - 100,
        50,
        10,
        [],
        [{ kind: "hash_mismatch", anno_id: "a1", detail: "test" }]
      );

      expect(report.blocks_scanned).toBe(50);
      expect(report.annotations_scanned).toBe(10);
      expect(report.summary.total_mismatches).toBe(1);
      expect(report.duration_ms).toBeGreaterThanOrEqual(0);
    });
  });

  describe("compareCanonTrees", () => {
    it("should detect equal trees", () => {
      const tree: CanonBlock = {
        id: "r/0",
        type: "paragraph",
        attrs: {},
        children: [{ text: "Hello", marks: [], is_leaf: true }],
      };

      const result = compareCanonTrees(tree, tree);
      expect(result.equal).toBe(true);
      expect(result.first_diff_path).toBeNull();
    });

    it("should detect different trees", () => {
      const tree1: CanonBlock = {
        id: "r/0",
        type: "paragraph",
        attrs: {},
        children: [{ text: "Hello", marks: [], is_leaf: true }],
      };
      const tree2: CanonBlock = {
        id: "r/0",
        type: "paragraph",
        attrs: {},
        children: [{ text: "World", marks: [], is_leaf: true }],
      };

      const result = compareCanonTrees(tree1, tree2);
      expect(result.equal).toBe(false);
      expect(result.first_diff_path).toBeTruthy();
    });
  });

  describe("PerformanceTracker", () => {
    it("should track scan metrics", () => {
      const tracker = new PerformanceTracker();
      tracker.recordScan(10);
      tracker.recordScan(20);

      const metrics = tracker.getMetrics();
      expect(metrics.scans_count).toBe(2);
      expect(metrics.last_scan_cpu_ms).toBe(20);
      expect(metrics.avg_scan_cpu_ms).toBe(15);
    });

    it("should track checkpoint metrics", () => {
      const tracker = new PerformanceTracker();
      tracker.recordCheckpoint(50);

      const metrics = tracker.getMetrics();
      expect(metrics.checkpoints_count).toBe(1);
      expect(metrics.last_checkpoint_cpu_ms).toBe(50);
    });

    it("should reset metrics", () => {
      const tracker = new PerformanceTracker();
      tracker.recordScan(10);
      tracker.reset();

      const metrics = tracker.getMetrics();
      expect(metrics.scans_count).toBe(0);
    });
  });

  describe("formatScanReport", () => {
    it("should format report as string", () => {
      const report = generateFullScanReport(Date.now(), 10, 5, [], []);
      const formatted = formatScanReport(report);

      expect(formatted).toContain("LFCC Full Integrity Scan Report");
      expect(formatted).toContain("Blocks scanned: 10");
    });
  });

  describe("createBugReportTemplate", () => {
    it("should create markdown template", () => {
      const report = generateFullScanReport(Date.now(), 10, 5, [], []);
      const template = createBugReportTemplate(report);

      expect(template).toContain("## LFCC Integrity Bug Report");
      expect(template).toContain("LFCC Version: 0.9 RC");
    });
  });
});
