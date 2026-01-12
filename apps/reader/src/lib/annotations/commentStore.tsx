"use client";

import { LoroList, type LoroRuntime } from "@keepup/lfcc-bridge";
import * as React from "react";
import { create, createStore, useStore } from "zustand";

// ============================================================================
// Types
// ============================================================================

export interface Comment {
  id: string;
  annotationId: string;
  text: string;
  author: string;
  createdAt: number;
  pending?: boolean; // Optimistic UI: true while syncing
}

interface CommentState {
  comments: Record<string, Comment[]>;
  runtime: LoroRuntime | null;
}

interface CommentActions {
  init: (runtime: LoroRuntime) => void;
  disconnect: () => void;
  addComment: (annotationId: string, text: string, author?: string) => void;
  deleteComment: (annotationId: string, commentId: string) => void;
  getComments: (annotationId: string) => Comment[];
  clearComments: (annotationId: string) => void;
}

type CommentStore = CommentState & CommentActions;

// ============================================================================
// Store Factory
// ============================================================================

function generateId(): string {
  return `comment_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function findCommentIndex(list: LoroList, commentId: string): number {
  for (let i = 0; i < list.length; i++) {
    const comment = list.get(i) as Comment;
    if (comment.id === commentId) {
      return i;
    }
  }
  return -1;
}

function deleteCommentFromRuntime(
  runtime: LoroRuntime,
  annotationId: string,
  commentId: string
): void {
  const docComments = runtime.doc.getMap("comments");
  const list = docComments.get(annotationId) as LoroList | undefined;
  if (!list) {
    return;
  }
  const index = findCommentIndex(list, commentId);
  if (index !== -1) {
    list.delete(index, 1);
  }
}

function syncStateFromRuntime(runtime: LoroRuntime): Record<string, Comment[]> {
  const docComments = runtime.doc.getMap("comments");
  const nextState: Record<string, Comment[]> = {};

  for (const [key, value] of docComments.entries()) {
    if (typeof key === "string" && value instanceof Object) {
      const list = value as LoroList;
      const comments: Comment[] = [];
      for (let i = 0; i < list.length; i++) {
        comments.push(list.get(i) as Comment);
      }
      nextState[key] = comments;
    }
  }

  return nextState;
}

export function createCommentStore() {
  let unsubscribe: (() => void) | undefined;

  return createStore<CommentStore>((set, get) => ({
    comments: {},
    runtime: null,

    init: (runtime: LoroRuntime) => {
      // Clean up previous subscription
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = undefined;
      }

      set({ runtime, comments: syncStateFromRuntime(runtime) });

      // Subscribe to changes
      unsubscribe = runtime.doc.subscribe(() => {
        set({ comments: syncStateFromRuntime(runtime) });
      });
    },

    disconnect: () => {
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = undefined;
      }
      set({ runtime: null, comments: {} });
    },

    addComment: (annotationId: string, text: string, author = "Local user") => {
      const runtime = get().runtime;
      const newComment: Comment = {
        id: generateId(),
        annotationId,
        text: text.trim(),
        author,
        createdAt: Date.now(),
      };

      if (runtime) {
        const docComments = runtime.doc.getMap("comments");
        let list = docComments.get(annotationId) as LoroList | undefined;
        if (!list) {
          list = docComments.getOrCreateContainer(annotationId, new LoroList());
        }
        list.push(newComment);
        runtime.commit("comments");
        set((state) => {
          const existing = state.comments[annotationId] ?? [];
          if (existing.some((comment) => comment.id === newComment.id)) {
            return state;
          }
          return {
            comments: {
              ...state.comments,
              [annotationId]: [...existing, newComment],
            },
          };
        });
      } else {
        set((state) => ({
          comments: {
            ...state.comments,
            [annotationId]: [...(state.comments[annotationId] ?? []), newComment],
          },
        }));
      }
    },

    deleteComment: (annotationId: string, commentId: string) => {
      const runtime = get().runtime;
      if (runtime) {
        deleteCommentFromRuntime(runtime, annotationId, commentId);
        runtime.commit("comments");
        return;
      }
      set((state) => ({
        comments: {
          ...state.comments,
          [annotationId]: (state.comments[annotationId] ?? []).filter((c) => c.id !== commentId),
        },
      }));
    },

    getComments: (annotationId: string) => {
      return get().comments[annotationId] ?? [];
    },

    clearComments: (annotationId: string) => {
      const runtime = get().runtime;
      if (runtime) {
        const docComments = runtime.doc.getMap("comments");
        docComments.delete(annotationId);
        runtime.commit("comments");
      } else {
        set((state) => {
          const { [annotationId]: _, ...rest } = state.comments;
          return { comments: rest };
        });
      }
    },
  }));
}

// ============================================================================
// Context
// ============================================================================

type CommentStoreApi = ReturnType<typeof createCommentStore>;

const CommentStoreContext = React.createContext<CommentStoreApi | null>(null);

export function CommentStoreProvider({
  children,
  store,
}: {
  children: React.ReactNode;
  store: CommentStoreApi;
}) {
  return <CommentStoreContext.Provider value={store}>{children}</CommentStoreContext.Provider>;
}

export function useCommentStoreContext<T>(selector: (state: CommentStore) => T): T {
  const store = React.useContext(CommentStoreContext);
  if (!store) {
    throw new Error("useCommentStoreContext must be used within CommentStoreProvider");
  }
  return useStore(store, selector);
}

// ============================================================================
// Backwards Compatibility: Global Singleton (deprecated)
// ============================================================================

/** @deprecated Use CommentStoreProvider + useCommentStoreContext instead */
export const useCommentStore = create<CommentStore>((set, get) => {
  let unsubscribeGlobal: (() => void) | undefined;

  return {
    comments: {},
    runtime: null,

    init: (runtime: LoroRuntime) => {
      if (unsubscribeGlobal) {
        unsubscribeGlobal();
        unsubscribeGlobal = undefined;
      }

      set({ runtime, comments: syncStateFromRuntime(runtime) });

      unsubscribeGlobal = runtime.doc.subscribe(() => {
        set({ comments: syncStateFromRuntime(runtime) });
      });
    },

    disconnect: () => {
      if (unsubscribeGlobal) {
        unsubscribeGlobal();
        unsubscribeGlobal = undefined;
      }
      set({ runtime: null, comments: {} });
    },

    addComment: (annotationId: string, text: string, author = "You") => {
      const runtime = get().runtime;
      const newComment: Comment = {
        id: generateId(),
        annotationId,
        text: text.trim(),
        author,
        createdAt: Date.now(),
      };

      if (runtime) {
        const docComments = runtime.doc.getMap("comments");
        let list = docComments.get(annotationId) as LoroList | undefined;
        if (!list) {
          list = docComments.getOrCreateContainer(annotationId, new LoroList());
        }
        list.push(newComment);
        runtime.commit("comments");
        set((state) => {
          const existing = state.comments[annotationId] ?? [];
          if (existing.some((comment) => comment.id === newComment.id)) {
            return state;
          }
          return {
            comments: {
              ...state.comments,
              [annotationId]: [...existing, newComment],
            },
          };
        });
      } else {
        set((state) => ({
          comments: {
            ...state.comments,
            [annotationId]: [...(state.comments[annotationId] ?? []), newComment],
          },
        }));
      }
    },

    deleteComment: (annotationId: string, commentId: string) => {
      const runtime = get().runtime;
      if (runtime) {
        deleteCommentFromRuntime(runtime, annotationId, commentId);
        runtime.commit("comments");
        return;
      }
      set((state) => ({
        comments: {
          ...state.comments,
          [annotationId]: (state.comments[annotationId] ?? []).filter((c) => c.id !== commentId),
        },
      }));
    },

    getComments: (annotationId: string) => {
      return get().comments[annotationId] ?? [];
    },

    clearComments: (annotationId: string) => {
      const runtime = get().runtime;
      if (runtime) {
        const docComments = runtime.doc.getMap("comments");
        docComments.delete(annotationId);
        runtime.commit("comments");
      } else {
        set((state) => {
          const { [annotationId]: _, ...rest } = state.comments;
          return { comments: rest };
        });
      }
    },
  };
});
