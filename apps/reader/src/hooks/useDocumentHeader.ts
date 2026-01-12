"use client";

import * as React from "react";

import type { DocMetadata } from "@/lib/persistence/docMetadata";
import { docPersistence } from "@/lib/persistence/docPersistence";

export interface DocumentHeaderState {
  title: string;
  sourceType: DocMetadata["sourceType"] | null;
  sourceUrl: string | null;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Hook to load document metadata for the editor header.
 * Returns title, source info for display in the header.
 */
export function useDocumentHeader(docId: string): DocumentHeaderState {
  const [state, setState] = React.useState<DocumentHeaderState>({
    title: "Untitled",
    sourceType: null,
    sourceUrl: null,
    isLoading: true,
    error: null,
  });

  React.useEffect(() => {
    let isMounted = true;

    async function loadMetadata() {
      try {
        const metadata = await docPersistence.loadMetadata(docId);

        if (!isMounted) {
          return;
        }

        if (metadata) {
          setState({
            title: metadata.title,
            sourceType: metadata.sourceType,
            sourceUrl: metadata.sourceUrl,
            isLoading: false,
            error: null,
          });
        } else {
          // No metadata found - use defaults
          setState({
            title: "Untitled",
            sourceType: "local",
            sourceUrl: null,
            isLoading: false,
            error: null,
          });
        }
      } catch (err) {
        if (!isMounted) {
          return;
        }
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: err instanceof Error ? err : new Error(String(err)),
        }));
      }
    }

    loadMetadata();

    return () => {
      isMounted = false;
    };
  }, [docId]);

  return state;
}
