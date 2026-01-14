import type { DirtyInfo } from "@ku0/core";

import type { DirtyInfoEntry, ReproErrorEntry } from "@/lib/lfcc/reproBundle";
import { createStore } from "@/lib/store";

export type DebugPerfSample = {
  dragUpdatesPerSecond: number;
  resolutionCallsPerSecond: number;
  decorationRebuildsPerSecond: number;
  avgResolutionDurationMs: number;
  p95ResolutionDurationMs: number;
};

export type IntegrityScanSummary = {
  ok: boolean;
  failureCount: number;
};

export type DivergenceSummary = {
  editorChecksum: string;
  loroChecksum: string;
  reason?: string;
  detectedAt: number;
};

type LfccDebugState = {
  dirtyInfoHistory: DirtyInfoEntry[];
  lastDirtyInfo: DirtyInfo | null;
  errors: ReproErrorEntry[];
  perf: DebugPerfSample;
  lastScanResult: IntegrityScanSummary | null;
  lastDivergence: DivergenceSummary | null;
  lastContextHash: string | null;
  addDirtyInfo: (info: DirtyInfo) => void;
  addError: (entry: Omit<ReproErrorEntry, "timestamp">) => void;
  setPerfSample: (sample: DebugPerfSample) => void;
  setScanResult: (summary: IntegrityScanSummary | null) => void;
  setDivergence: (summary: DivergenceSummary | null) => void;
  setContextHash: (hash: string | null) => void;
};

const MAX_DEBUG_ENTRIES = 25;

const DEFAULT_PERF_SAMPLE: DebugPerfSample = {
  dragUpdatesPerSecond: 0,
  resolutionCallsPerSecond: 0,
  decorationRebuildsPerSecond: 0,
  avgResolutionDurationMs: 0,
  p95ResolutionDurationMs: 0,
};

export const useLfccDebugStore = createStore<LfccDebugState>("lfcc-debug-store", (set) => ({
  dirtyInfoHistory: [],
  lastDirtyInfo: null,
  errors: [],
  perf: DEFAULT_PERF_SAMPLE,
  lastScanResult: null,
  lastDivergence: null,
  lastContextHash: null,
  addDirtyInfo: (info) =>
    set((state) => {
      const entry: DirtyInfoEntry = { timestamp: Date.now(), info };
      const history = [...state.dirtyInfoHistory, entry];
      const trimmed =
        history.length > MAX_DEBUG_ENTRIES
          ? history.slice(history.length - MAX_DEBUG_ENTRIES)
          : history;
      return { dirtyInfoHistory: trimmed, lastDirtyInfo: info };
    }),
  addError: (entry) =>
    set((state) => {
      const next: ReproErrorEntry = { timestamp: Date.now(), ...entry };
      const history = [...state.errors, next];
      const trimmed =
        history.length > MAX_DEBUG_ENTRIES
          ? history.slice(history.length - MAX_DEBUG_ENTRIES)
          : history;
      return { errors: trimmed };
    }),
  setPerfSample: (sample) => set(() => ({ perf: sample })),
  setScanResult: (summary) => set(() => ({ lastScanResult: summary })),
  setDivergence: (summary) => set(() => ({ lastDivergence: summary })),
  setContextHash: (hash) => set(() => ({ lastContextHash: hash })),
}));
