"use client";

import type { ProjectContextSnapshot } from "@/lib/ai/projectContextTypes";
import * as React from "react";

export type ProjectContextState = {
  data: ProjectContextSnapshot | null;
  isLoading: boolean;
  error: string | null;
};

const INITIAL_STATE: ProjectContextState = {
  data: null,
  isLoading: true,
  error: null,
};

export function useProjectContext() {
  const [state, setState] = React.useState<ProjectContextState>(INITIAL_STATE);
  const abortRef = React.useRef<AbortController | null>(null);

  const fetchSnapshot = React.useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const res = await fetch("/api/ai/project-context", {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`Request failed (${res.status})`);
      }
      const payload = (await res.json()) as ProjectContextSnapshot;
      if (controller.signal.aborted) {
        return;
      }
      setState({ data: payload, isLoading: false, error: null });
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      const message = error instanceof Error ? error.message : "Failed to load project context";
      setState({ data: null, isLoading: false, error: message });
    }
  }, []);

  React.useEffect(() => {
    void fetchSnapshot();
    return () => {
      abortRef.current?.abort();
    };
  }, [fetchSnapshot]);

  return {
    ...state,
    refresh: fetchSnapshot,
  };
}
