"use client";

import {
  type Comment,
  type DocumentFacade,
  type LoroRuntime,
  createDocumentFacade,
} from "@keepup/lfcc-bridge";
import * as React from "react";
import { create, createStore, useStore } from "zustand";

// ============================================================================
// Types
// ============================================================================

/** Extended Comment type with UI-specific fields */
export interface UIComment extends Comment {
  pending?: boolean; // Optimistic UI: true while syncing
}

interface CommentState {
  comments: Record<string, UIComment[]>;
  facade: DocumentFacade | null;
}

interface CommentActions {
  init: (runtime: LoroRuntime) => void;
  disconnect: () => void;
  addComment: (annotationId: string, text: string, author?: string) => void;
  deleteComment: (annotationId: string, commentId: string) => void;
  getComments: (annotationId: string) => UIComment[];
  clearComments: (annotationId: string) => void;
}

type CommentStore = CommentState & CommentActions;

// ============================================================================
// Store Factory
// ============================================================================

function syncStateFromFacade(facade: DocumentFacade): Record<string, UIComment[]> {
  // Get all annotation IDs from annotations
  const annotations = facade.getAnnotations();
  const result: Record<string, UIComment[]> = {};

  for (const annotation of annotations) {
    const comments = facade.getComments(annotation.id);
    if (comments.length > 0) {
      result[annotation.id] = comments.map((c) => ({ ...c, pending: false }));
    }
  }

  // Also check for comments on annotations we might not have in getAnnotations()
  // This handles the case where comments exist but annotation list is stale
  return result;
}

export function createCommentStore() {
  let unsubscribe: (() => void) | undefined;

  return createStore<CommentStore>((set, get) => ({
    comments: {},
    facade: null,

    init: (runtime: LoroRuntime) => {
      // Clean up previous subscription
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = undefined;
      }

      const facade = createDocumentFacade(runtime);
      set({ facade, comments: syncStateFromFacade(facade) });

      // Subscribe to changes via Facade
      unsubscribe = facade.subscribe((event) => {
        if (event.type === "comment_changed" || event.type === "remote_update") {
          set({ comments: syncStateFromFacade(facade) });
        }
      });
    },

    disconnect: () => {
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = undefined;
      }
      set({ facade: null, comments: {} });
    },

    addComment: (annotationId: string, text: string, author = "Local user") => {
      const facade = get().facade;

      if (facade) {
        const commentId = facade.addComment({
          annotationId,
          text: text.trim(),
          author,
          origin: "comment-store:add",
        });

        // Optimistic update
        const newComment: UIComment = {
          id: commentId,
          annotationId,
          text: text.trim(),
          author,
          createdAt: Date.now(),
          pending: false,
        };

        set((state) => {
          const existing = state.comments[annotationId] ?? [];
          if (existing.some((c) => c.id === commentId)) {
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
        // Offline mode - local only
        const commentId = `comment_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const newComment: UIComment = {
          id: commentId,
          annotationId,
          text: text.trim(),
          author,
          createdAt: Date.now(),
          pending: true,
        };

        set((state) => ({
          comments: {
            ...state.comments,
            [annotationId]: [...(state.comments[annotationId] ?? []), newComment],
          },
        }));
      }
    },

    deleteComment: (annotationId: string, commentId: string) => {
      const facade = get().facade;

      if (facade) {
        facade.deleteComment({
          annotationId,
          commentId,
          origin: "comment-store:delete",
        });
      }

      // Optimistic update
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
      const facade = get().facade;

      if (facade) {
        // Delete all comments for this annotation
        const comments = get().comments[annotationId] ?? [];
        for (const comment of comments) {
          facade.deleteComment({
            annotationId,
            commentId: comment.id,
            origin: "comment-store:clear",
          });
        }
      }

      set((state) => {
        const { [annotationId]: _, ...rest } = state.comments;
        return { comments: rest };
      });
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
  let globalFacade: DocumentFacade | null = null;

  return {
    comments: {},
    facade: null,

    init: (runtime: LoroRuntime) => {
      if (unsubscribeGlobal) {
        unsubscribeGlobal();
        unsubscribeGlobal = undefined;
      }

      globalFacade = createDocumentFacade(runtime);
      set({ facade: globalFacade, comments: syncStateFromFacade(globalFacade) });

      unsubscribeGlobal = globalFacade.subscribe((event) => {
        if ((event.type === "comment_changed" || event.type === "remote_update") && globalFacade) {
          set({ comments: syncStateFromFacade(globalFacade) });
        }
      });
    },

    disconnect: () => {
      if (unsubscribeGlobal) {
        unsubscribeGlobal();
        unsubscribeGlobal = undefined;
      }
      globalFacade = null;
      set({ facade: null, comments: {} });
    },

    addComment: (annotationId: string, text: string, author = "You") => {
      const facade = globalFacade;

      if (facade) {
        const commentId = facade.addComment({
          annotationId,
          text: text.trim(),
          author,
          origin: "comment-store:add",
        });

        const newComment: UIComment = {
          id: commentId,
          annotationId,
          text: text.trim(),
          author,
          createdAt: Date.now(),
          pending: false,
        };

        set((state) => {
          const existing = state.comments[annotationId] ?? [];
          if (existing.some((c) => c.id === commentId)) {
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
        const commentId = `comment_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const newComment: UIComment = {
          id: commentId,
          annotationId,
          text: text.trim(),
          author,
          createdAt: Date.now(),
          pending: true,
        };

        set((state) => ({
          comments: {
            ...state.comments,
            [annotationId]: [...(state.comments[annotationId] ?? []), newComment],
          },
        }));
      }
    },

    deleteComment: (annotationId: string, commentId: string) => {
      if (globalFacade) {
        globalFacade.deleteComment({
          annotationId,
          commentId,
          origin: "comment-store:delete",
        });
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
      if (globalFacade) {
        const comments = get().comments[annotationId] ?? [];
        for (const comment of comments) {
          globalFacade.deleteComment({
            annotationId,
            commentId: comment.id,
            origin: "comment-store:clear",
          });
        }
      }

      set((state) => {
        const { [annotationId]: _, ...rest } = state.comments;
        return { comments: rest };
      });
    },
  };
});
