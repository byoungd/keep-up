import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

export type HistorySnapshot = {
  id: string;
  timestamp: number;
  docSize: number;
  description?: string;
};

export type HistoryTrackerState = {
  snapshots: HistorySnapshot[];
  lastSnapshotTime: number;
};

export const historyTrackerKey = new PluginKey<HistoryTrackerState>("historyTracker");

export type HistoryTrackerOptions = {
  snapshotIntervalMs?: number;
  onSnapshot?: (snapshot: HistorySnapshot) => void;
};

export function createHistoryTrackerPlugin(options: HistoryTrackerOptions = {}) {
  const interval = options.snapshotIntervalMs ?? 10000; // Default 10s

  return new Plugin<HistoryTrackerState>({
    key: historyTrackerKey,
    state: {
      init() {
        return {
          snapshots: [],
          lastSnapshotTime: Date.now(),
        };
      },
      apply(tr, state) {
        // If document changed
        if (!tr.docChanged) {
          return state;
        }

        const now = Date.now();
        // Check if we should take a snapshot
        // Logic: specific time interval passed since last snapshot
        if (now - state.lastSnapshotTime > interval) {
          const snapshot: HistorySnapshot = {
            id: generateId(),
            timestamp: now,
            docSize: tr.doc.content.size,
            description: `Edit at ${new Date(now).toLocaleTimeString()}`,
          };

          if (options.onSnapshot) {
            options.onSnapshot(snapshot);
          }

          return {
            snapshots: [...state.snapshots, snapshot],
            lastSnapshotTime: now,
          };
        }

        return state;
      },
    },
    view(_view: EditorView) {
      return {
        update: (_view, _prevState) => {
          // Potential side effects
        },
      };
    },
  });
}

function generateId() {
  return Math.random().toString(36).substring(2, 9);
}
