/**
 * LFCC v0.9 RC - Mock Annotation UI Adapter
 * @see docs/product/LFCC_v0.9_RC_Parallel_Workstreams/02_UI_Annotation_Panel_and_UX.md Section A2
 *
 * Mock implementation for development and testing.
 */

import type { AnnotationListItem, AnnotationStatus, AnnotationUIAdapter } from "./types";

/** Mock data for testing */
const MOCK_ANNOTATIONS: AnnotationListItem[] = [
  {
    annotation_id: "anno-001",
    thread_id: "thread-001",
    kind: "comment",
    status: "active",
    excerpt: "This is a great point about the architecture...",
    updated_at_ms: Date.now() - 60000,
    span_count: 1,
    author: { id: "user-1", name: "Alice Chen" },
    comment_count: 3,
  },
  {
    annotation_id: "anno-002",
    thread_id: "thread-002",
    kind: "highlight",
    status: "active_unverified",
    excerpt: "Key insight about performance optimization",
    updated_at_ms: Date.now() - 120000,
    span_count: 2,
    author: { id: "user-2", name: "Bob Smith" },
  },
  {
    annotation_id: "anno-003",
    kind: "suggestion",
    status: "broken_grace",
    excerpt: "Consider refactoring this section...",
    updated_at_ms: Date.now() - 300000,
    span_count: 1,
    author: { id: "user-1", name: "Alice Chen" },
    comment_count: 1,
  },
  {
    annotation_id: "anno-004",
    kind: "highlight",
    status: "active_partial",
    excerpt: "Important reference to the specification",
    updated_at_ms: Date.now() - 600000,
    span_count: 3,
    unresolved_gap_count: 1,
    author: { id: "user-3", name: "Carol Davis" },
  },
  {
    annotation_id: "anno-005",
    thread_id: "thread-003",
    kind: "comment",
    status: "orphan",
    excerpt: "This content was deleted but the comment remains",
    updated_at_ms: Date.now() - 3600000,
    span_count: 0,
    author: { id: "user-2", name: "Bob Smith" },
    comment_count: 5,
  },
  {
    annotation_id: "anno-006",
    kind: "highlight",
    status: "active",
    excerpt: "Another active highlight for testing",
    updated_at_ms: Date.now() - 7200000,
    span_count: 1,
    author: { id: "user-1", name: "Alice Chen" },
    is_resolved: true,
  },
];

/** Event callbacks for mock adapter */
export type MockAdapterCallbacks = {
  onOpenThread?: (annotation_id: string) => void;
  onScrollTo?: (annotation_id: string) => void;
  onRequestVerify?: (annotation_id: string) => void;
  onResolve?: (annotation_id: string) => void;
  onDelete?: (annotation_id: string) => void;
};

/**
 * Create a mock annotation UI adapter
 */
export function createMockAdapter(
  initialData: AnnotationListItem[] = MOCK_ANNOTATIONS,
  callbacks: MockAdapterCallbacks = {}
): AnnotationUIAdapter & {
  /** Get current mock data */
  getData(): AnnotationListItem[];
  /** Update mock data */
  setData(data: AnnotationListItem[]): void;
  /** Add annotation */
  addAnnotation(item: AnnotationListItem): void;
  /** Update annotation status */
  updateStatus(annotation_id: string, status: AnnotationStatus): void;
  /** Simulate network delay */
  setDelay(ms: number): void;
} {
  let data = [...initialData];
  let delay = 100;

  const simulateDelay = () => new Promise<void>((resolve) => setTimeout(resolve, delay));

  return {
    async listThreads() {
      await simulateDelay();
      return [...data];
    },

    async openThread(annotation_id: string) {
      await simulateDelay();
      callbacks.onOpenThread?.(annotation_id);
    },

    async scrollToAnnotation(annotation_id: string) {
      await simulateDelay();
      callbacks.onScrollTo?.(annotation_id);
    },

    async requestVerify(annotation_id: string) {
      await simulateDelay();
      callbacks.onRequestVerify?.(annotation_id);

      // Simulate verification completing
      const item = data.find((a) => a.annotation_id === annotation_id);
      if (item && item.status === "active_unverified") {
        item.status = "active";
      }
    },

    async resolveAnnotation(annotation_id: string) {
      await simulateDelay();
      callbacks.onResolve?.(annotation_id);

      const item = data.find((a) => a.annotation_id === annotation_id);
      if (item) {
        item.is_resolved = true;
      }
    },

    async deleteAnnotation(annotation_id: string) {
      await simulateDelay();
      callbacks.onDelete?.(annotation_id);
      data = data.filter((a) => a.annotation_id !== annotation_id);
    },

    getData() {
      return [...data];
    },

    setData(newData: AnnotationListItem[]) {
      data = [...newData];
    },

    addAnnotation(item: AnnotationListItem) {
      data.push(item);
    },

    updateStatus(annotation_id: string, status: AnnotationStatus) {
      const item = data.find((a) => a.annotation_id === annotation_id);
      if (item) {
        item.status = status;
      }
    },

    setDelay(ms: number) {
      delay = ms;
    },
  };
}

/** Default mock adapter instance */
export const defaultMockAdapter = createMockAdapter();
