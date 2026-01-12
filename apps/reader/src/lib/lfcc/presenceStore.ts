import { createStore } from "@/lib/store";

export type PresenceCursor = {
  blockId: string;
  offset: number;
};

export type PresencePeer = {
  clientId: string;
  displayName: string;
  color: string;
  lastSeen?: number;
  cursor?: PresenceCursor;
};

type PresenceState = {
  selfId: string | null;
  peers: PresencePeer[];
  setPresence: (input: { selfId: string | null; peers: PresencePeer[] }) => void;
};

export const usePresenceStore = createStore<PresenceState>("presence-store", (set) => ({
  selfId: null,
  peers: [],
  setPresence: ({ selfId, peers }) => set(() => ({ selfId, peers })),
}));

export function usePresenceSummary(): { peers: PresencePeer[]; hasRemote: boolean } {
  const peers = usePresenceStore((state) => state.peers);

  const sorted = [...peers].sort((a, b) => {
    const nameCompare = a.displayName.localeCompare(b.displayName);
    if (nameCompare !== 0) {
      return nameCompare;
    }
    return a.clientId.localeCompare(b.clientId);
  });

  return {
    peers: sorted,
    hasRemote: sorted.length > 0,
  };
}

/**
 * Returns only peers that have active cursor positions
 */
export function usePeersWithCursors(): PresencePeer[] {
  const peers = usePresenceStore((state) => state.peers);
  return peers.filter((p) => p.cursor !== undefined);
}
