"use client";

import * as React from "react";

import type { DocumentTextResult } from "@/lib/documents/documentService";
import { getDocumentTextById } from "@/lib/documents/documentService";

export interface DocumentContentState {
  document: DocumentTextResult | null;
  content: string;
  isLoading: boolean;
  error: Error | null;
  notFound: boolean;
}

const INITIAL_STATE: DocumentContentState = {
  document: null,
  content: "",
  isLoading: true,
  error: null,
  notFound: false,
};

const NOT_FOUND_STATE: DocumentContentState = {
  document: null,
  content: "",
  isLoading: false,
  error: null,
  notFound: true,
};

/** Create success state from document */
function createSuccessState(document: DocumentTextResult): DocumentContentState {
  return {
    document,
    content: document.contentText,
    isLoading: false,
    error: null,
    notFound: false,
  };
}

/** Create error state from error */
function createErrorState(err: unknown): DocumentContentState {
  return {
    document: null,
    content: "",
    isLoading: false,
    error: err instanceof Error ? err : new Error(String(err)),
    notFound: false,
  };
}

export function useDocumentContent(docId: string | null): DocumentContentState {
  const [state, setState] = React.useState<DocumentContentState>(INITIAL_STATE);

  React.useEffect(() => {
    let isMounted = true;

    if (!docId) {
      setState(NOT_FOUND_STATE);
      return undefined;
    }

    const load = async () => {
      setState((prev) => ({ ...prev, isLoading: true, error: null, notFound: false }));

      try {
        const document = await getDocumentTextById(docId);

        if (!isMounted) {
          return;
        }

        setState(document ? createSuccessState(document) : NOT_FOUND_STATE);
      } catch (err) {
        if (isMounted) {
          setState(createErrorState(err));
        }
      }
    };

    load();

    return () => {
      isMounted = false;
    };
  }, [docId]);

  return state;
}
