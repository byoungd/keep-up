import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useMemo } from "react";
import { isTauriRuntime } from "../../../lib/tauriRuntime";

export type VectorChunk = {
  id: number;
  file_path: string;
  chunk_index: number;
  content: string;
  token_count?: number | null;
  created_at: number;
  updated_at: number;
};

export type ChunkInput = {
  file_path: string;
  chunk_index: number;
  content: string;
  token_count?: number | null;
  embedding?: number[];
};

export type VectorSearchResult = {
  chunk: VectorChunk;
  score: number;
  highlights: string[];
};

export type VectorStoreStats = {
  total_chunks: number;
  total_files: number;
  last_updated?: number | null;
};

export type VectorSearchQuery = {
  query: string;
  limit?: number;
  file_filter?: string[];
  min_score?: number;
  embedding?: number[];
};

export type ListChunksArgs = {
  limit?: number;
  offset?: number;
  file_filter?: string[];
};

export type DeleteChunksArgs = {
  ids?: number[];
  file_paths?: string[];
  delete_all?: boolean;
};

export type IndexStatus =
  | { state: "idle" }
  | { state: "indexing" }
  | { state: "completed" }
  | { state: "error"; message: string };

export type IndexProgress = {
  total_files: number;
  processed_files: number;
  current_file: string;
  status: IndexStatus;
};

export type IndexFilesOptions = {
  chunkSize?: number;
  overlap?: number;
};

export type IndexListener = {
  stop: () => void;
};

export function useVectorStore() {
  const isAvailable = useMemo(() => isTauriRuntime(), []);

  const stats = useCallback(async () => {
    if (!isAvailable) {
      return null;
    }
    return invoke<VectorStoreStats>("vectorstore_stats");
  }, [isAvailable]);

  const listChunks = useCallback(
    async (args: ListChunksArgs) => {
      if (!isAvailable) {
        return [] as VectorChunk[];
      }
      return invoke<VectorChunk[]>("vectorstore_list_chunks", { args });
    },
    [isAvailable]
  );

  const search = useCallback(
    async (query: VectorSearchQuery) => {
      if (!isAvailable) {
        return [] as VectorSearchResult[];
      }
      return invoke<VectorSearchResult[]>("vectorstore_search", { query });
    },
    [isAvailable]
  );

  const upsertChunks = useCallback(
    async (chunks: ChunkInput[]) => {
      if (!isAvailable || chunks.length === 0) {
        return;
      }
      await invoke<void>("vectorstore_upsert_chunks", { chunks });
    },
    [isAvailable]
  );

  const deleteChunks = useCallback(
    async (args: DeleteChunksArgs) => {
      if (!isAvailable) {
        return 0;
      }
      return invoke<number>("vectorstore_delete_chunks", { args });
    },
    [isAvailable]
  );

  const indexFiles = useCallback(
    async (
      paths: string[],
      options?: IndexFilesOptions,
      onProgress?: (progress: IndexProgress) => void
    ): Promise<IndexListener | null> => {
      if (!isAvailable || paths.length === 0) {
        return null;
      }

      const id = crypto.randomUUID();
      const eventName = `vectorstore-index-${id}`;

      let stop = () => undefined;
      if (onProgress) {
        const unlistenPromise = listen<IndexProgress>(eventName, (event) => {
          onProgress(event.payload);
        });

        stop = () => {
          void unlistenPromise.then((unlisten) => unlisten());
        };
      }

      await invoke<void>("vectorstore_index_files", {
        args: {
          id,
          paths,
          chunk_size: options?.chunkSize,
          overlap: options?.overlap,
        },
      });

      return { stop };
    },
    [isAvailable]
  );

  return {
    isAvailable,
    stats,
    listChunks,
    search,
    upsertChunks,
    deleteChunks,
    indexFiles,
  };
}
