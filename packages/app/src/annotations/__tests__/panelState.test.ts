/**
 * LFCC v0.9 RC - Panel State Tests
 */

import { describe, expect, it } from "vitest";
import {
  INITIAL_PANEL_STATE,
  calculateStats,
  clearError,
  closePanel,
  filterAnnotations,
  filterAnnotationsByStatuses,
  groupByThread,
  openPanel,
  processAnnotations,
  selectAnnotation,
  setError,
  setFilter,
  setLoading,
  setSort,
  sortAnnotations,
  togglePanel,
  toggleSortDirection,
} from "../panelState.js";
import type { AnnotationListItem, AnnotationPanelState } from "../types.js";

describe("Panel State", () => {
  describe("INITIAL_PANEL_STATE", () => {
    it("should have correct defaults", () => {
      expect(INITIAL_PANEL_STATE.isOpen).toBe(false);
      expect(INITIAL_PANEL_STATE.selectedAnnotationId).toBeNull();
      expect(INITIAL_PANEL_STATE.isLoading).toBe(false);
      expect(INITIAL_PANEL_STATE.error).toBeNull();
    });
  });

  describe("openPanel / closePanel / togglePanel", () => {
    it("should open panel", () => {
      const state = openPanel(INITIAL_PANEL_STATE);
      expect(state.isOpen).toBe(true);
    });

    it("should close panel", () => {
      const state = closePanel({ ...INITIAL_PANEL_STATE, isOpen: true });
      expect(state.isOpen).toBe(false);
    });

    it("should toggle panel", () => {
      let state = togglePanel(INITIAL_PANEL_STATE);
      expect(state.isOpen).toBe(true);

      state = togglePanel(state);
      expect(state.isOpen).toBe(false);
    });
  });

  describe("selectAnnotation", () => {
    it("should select annotation", () => {
      const state = selectAnnotation(INITIAL_PANEL_STATE, "anno-1");
      expect(state.selectedAnnotationId).toBe("anno-1");
    });

    it("should deselect annotation", () => {
      const state = selectAnnotation(
        { ...INITIAL_PANEL_STATE, selectedAnnotationId: "anno-1" },
        null
      );
      expect(state.selectedAnnotationId).toBeNull();
    });
  });

  describe("setFilter", () => {
    it("should set filter", () => {
      const state = setFilter(INITIAL_PANEL_STATE, { status: "active" });
      expect(state.filter.status).toBe("active");
    });

    it("should merge filters", () => {
      let state = setFilter(INITIAL_PANEL_STATE, { status: "active" });
      state = setFilter(state, { kind: "comment" });
      expect(state.filter.status).toBe("active");
      expect(state.filter.kind).toBe("comment");
    });
  });

  describe("setSort", () => {
    it("should set sort", () => {
      const state = setSort(INITIAL_PANEL_STATE, "status");
      expect(state.sort).toBe("status");
    });

    it("should set sort with direction", () => {
      const state = setSort(INITIAL_PANEL_STATE, "author", "asc");
      expect(state.sort).toBe("author");
      expect(state.sortDirection).toBe("asc");
    });
  });

  describe("toggleSortDirection", () => {
    it("should toggle direction", () => {
      let state = toggleSortDirection(INITIAL_PANEL_STATE);
      expect(state.sortDirection).toBe("asc");

      state = toggleSortDirection(state);
      expect(state.sortDirection).toBe("desc");
    });
  });

  describe("setLoading / setError / clearError", () => {
    it("should set loading", () => {
      const state = setLoading(INITIAL_PANEL_STATE, true);
      expect(state.isLoading).toBe(true);
    });

    it("should clear error when loading", () => {
      const state = setLoading({ ...INITIAL_PANEL_STATE, error: "test" }, true);
      expect(state.error).toBeNull();
    });

    it("should set error", () => {
      const state = setError(INITIAL_PANEL_STATE, "Test error");
      expect(state.error).toBe("Test error");
      expect(state.isLoading).toBe(false);
    });

    it("should clear error", () => {
      const state = clearError({ ...INITIAL_PANEL_STATE, error: "test" });
      expect(state.error).toBeNull();
    });
  });
});

describe("Filtering & Sorting", () => {
  const mockAnnotations: AnnotationListItem[] = [
    {
      annotation_id: "a1",
      kind: "comment",
      status: "active",
      updated_at_ms: 1000,
      span_count: 1,
      author: { id: "u1", name: "Alice" },
    },
    {
      annotation_id: "a2",
      kind: "highlight",
      status: "orphan",
      updated_at_ms: 2000,
      span_count: 0,
      author: { id: "u2", name: "Bob" },
    },
    {
      annotation_id: "a3",
      kind: "suggestion",
      status: "active_unverified",
      updated_at_ms: 3000,
      span_count: 2,
      author: { id: "u1", name: "Alice" },
    },
    {
      annotation_id: "a4",
      kind: "comment",
      status: "broken_grace",
      updated_at_ms: 4000,
      span_count: 1,
      is_resolved: true,
    },
  ];

  describe("filterAnnotations", () => {
    it("should filter by status", () => {
      const filtered = filterAnnotations(mockAnnotations, { status: "active" });
      expect(filtered.length).toBe(1);
      expect(filtered[0].annotation_id).toBe("a1");
    });

    it("should filter by kind", () => {
      const filtered = filterAnnotations(mockAnnotations, { kind: "comment" });
      expect(filtered.length).toBe(2);
    });

    it("should filter by author", () => {
      const filtered = filterAnnotations(mockAnnotations, { author_id: "u1" });
      expect(filtered.length).toBe(2);
    });

    it("should filter unresolved only", () => {
      const filtered = filterAnnotations(mockAnnotations, { unresolved_only: true });
      expect(filtered.length).toBe(3);
    });

    it("should return all with 'all' filter", () => {
      const filtered = filterAnnotations(mockAnnotations, { status: "all", kind: "all" });
      expect(filtered.length).toBe(4);
    });
  });

  describe("filterAnnotationsByStatuses", () => {
    it("should filter by multiple statuses", () => {
      const filtered = filterAnnotationsByStatuses(mockAnnotations, [
        "active_unverified",
        "broken_grace",
      ]);
      expect(filtered.length).toBe(2);
      expect(filtered.map((item) => item.annotation_id)).toEqual(["a3", "a4"]);
    });

    it("should return empty for no statuses", () => {
      const filtered = filterAnnotationsByStatuses(mockAnnotations, []);
      expect(filtered.length).toBe(0);
    });
  });

  describe("sortAnnotations", () => {
    it("should sort by recency desc", () => {
      const sorted = sortAnnotations(mockAnnotations, "recency", "desc");
      expect(sorted[0].annotation_id).toBe("a4");
      expect(sorted[3].annotation_id).toBe("a1");
    });

    it("should sort by recency asc", () => {
      const sorted = sortAnnotations(mockAnnotations, "recency", "asc");
      expect(sorted[0].annotation_id).toBe("a1");
    });

    it("should sort by status", () => {
      const sorted = sortAnnotations(mockAnnotations, "status", "asc");
      expect(sorted[0].status).toBe("orphan");
    });

    it("should sort by author", () => {
      const sorted = sortAnnotations(mockAnnotations, "author", "asc");
      // First should be the one without author (empty string), then Alice, then Bob
      const firstWithAuthor = sorted.find((a) => a.author?.name);
      expect(firstWithAuthor?.author?.name).toBe("Alice");
    });

    it("should sort by kind", () => {
      const sorted = sortAnnotations(mockAnnotations, "kind", "asc");
      expect(sorted[0].kind).toBe("comment");
    });
  });

  describe("processAnnotations", () => {
    it("should filter and sort", () => {
      const state: AnnotationPanelState = {
        ...INITIAL_PANEL_STATE,
        filter: { status: "all", kind: "comment" },
        sort: "recency",
        sortDirection: "desc",
      };

      const processed = processAnnotations(mockAnnotations, state);
      expect(processed.length).toBe(2);
      expect(processed[0].annotation_id).toBe("a4");
    });
  });
});

describe("Grouping", () => {
  const mockAnnotations: AnnotationListItem[] = [
    {
      annotation_id: "a1",
      thread_id: "t1",
      kind: "comment",
      status: "active",
      updated_at_ms: 1000,
      span_count: 1,
    },
    {
      annotation_id: "a2",
      thread_id: "t1",
      kind: "comment",
      status: "active",
      updated_at_ms: 2000,
      span_count: 1,
    },
    {
      annotation_id: "a3",
      thread_id: "t2",
      kind: "comment",
      status: "active",
      updated_at_ms: 3000,
      span_count: 1,
    },
    {
      annotation_id: "a4",
      kind: "highlight",
      status: "active",
      updated_at_ms: 4000,
      span_count: 1,
    },
  ];

  describe("groupByThread", () => {
    it("should group by thread", () => {
      const groups = groupByThread(mockAnnotations);
      expect(groups.length).toBe(3);
    });

    it("should calculate latest update", () => {
      const groups = groupByThread(mockAnnotations);
      const t1Group = groups.find((g) => g.threadId === "t1");
      expect(t1Group?.latestUpdate).toBe(2000);
    });

    it("should handle null thread", () => {
      const groups = groupByThread(mockAnnotations);
      const nullGroup = groups.find((g) => g.threadId === null);
      expect(nullGroup?.annotations.length).toBe(1);
    });
  });
});

describe("Statistics", () => {
  const mockAnnotations: AnnotationListItem[] = [
    { annotation_id: "a1", kind: "comment", status: "active", updated_at_ms: 1000, span_count: 1 },
    {
      annotation_id: "a2",
      kind: "highlight",
      status: "orphan",
      updated_at_ms: 2000,
      span_count: 0,
    },
    {
      annotation_id: "a3",
      kind: "comment",
      status: "active_partial",
      updated_at_ms: 3000,
      span_count: 2,
      unresolved_gap_count: 1,
    },
    {
      annotation_id: "a4",
      kind: "suggestion",
      status: "active",
      updated_at_ms: 4000,
      span_count: 1,
      is_resolved: true,
    },
  ];

  describe("calculateStats", () => {
    it("should calculate total", () => {
      const stats = calculateStats(mockAnnotations);
      expect(stats.total).toBe(4);
    });

    it("should count by status", () => {
      const stats = calculateStats(mockAnnotations);
      expect(stats.byStatus.active).toBe(2);
      expect(stats.byStatus.orphan).toBe(1);
      expect(stats.byStatus.active_partial).toBe(1);
    });

    it("should count by kind", () => {
      const stats = calculateStats(mockAnnotations);
      expect(stats.byKind.comment).toBe(2);
      expect(stats.byKind.highlight).toBe(1);
      expect(stats.byKind.suggestion).toBe(1);
    });

    it("should count unresolved", () => {
      const stats = calculateStats(mockAnnotations);
      expect(stats.unresolved).toBe(3);
    });

    it("should count with gaps", () => {
      const stats = calculateStats(mockAnnotations);
      expect(stats.withGaps).toBe(1);
    });
  });
});
