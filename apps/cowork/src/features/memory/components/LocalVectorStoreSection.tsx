import { open } from "@tauri-apps/api/dialog";
import React from "react";
import { cn } from "../../../lib/cn";
import { isTauriRuntime } from "../../../lib/tauriRuntime";
import {
  type IndexListener,
  type IndexProgress,
  useVectorStore,
  type VectorChunk,
  type VectorSearchResult,
} from "../hooks/useVectorStore";

const DEFAULT_CHUNK_SIZE = 1200;
const DEFAULT_CHUNK_OVERLAP = 200;

type StatsState = {
  total_chunks: number;
  total_files: number;
  last_updated?: number | null;
} | null;

type IndexingState = {
  paths: string[];
  pathInput: string;
  setPathInput: (value: string) => void;
  addPath: () => void;
  removePath: (value: string) => void;
  pickFolder: () => Promise<void>;
  handleIndex: () => Promise<void>;
  progress: IndexProgress | null;
  isIndexing: boolean;
  error: string | null;
  clearError: () => void;
};

type SearchState = {
  query: string;
  setQuery: (value: string) => void;
  results: VectorSearchResult[];
  handleSearch: () => Promise<void>;
  clearResults: () => void;
};

type RecentState = {
  recent: VectorChunk[];
  handleDelete: (id: number) => Promise<void>;
  handleClearAll: () => Promise<void>;
};

function useVectorStats(isAvailable: boolean, fetchStats: () => Promise<StatsState>) {
  const [statsState, setStatsState] = React.useState<StatsState>(null);

  const refresh = React.useCallback(async () => {
    if (!isAvailable) {
      return;
    }
    const data = await fetchStats();
    setStatsState(data);
  }, [fetchStats, isAvailable]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  return { statsState, refresh };
}

function useRecentChunks(
  isAvailable: boolean,
  listChunks: (args: { limit: number; offset: number }) => Promise<VectorChunk[]>
) {
  const [recent, setRecent] = React.useState<VectorChunk[]>([]);

  const refresh = React.useCallback(async () => {
    if (!isAvailable) {
      return;
    }
    const chunks = await listChunks({ limit: 12, offset: 0 });
    setRecent(chunks);
  }, [isAvailable, listChunks]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  return { recent, refresh, setRecent };
}

function useIndexingControls(options: {
  isAvailable: boolean;
  indexFiles: (
    paths: string[],
    options?: { chunkSize?: number; overlap?: number },
    onProgress?: (progress: IndexProgress) => void
  ) => Promise<IndexListener | null>;
  refreshStats: () => Promise<void>;
  refreshRecent: () => Promise<void>;
}) {
  const { isAvailable, indexFiles, refreshStats, refreshRecent } = options;
  const [paths, setPaths] = React.useState<string[]>([]);
  const [pathInput, setPathInput] = React.useState("");
  const [progress, setProgress] = React.useState<IndexProgress | null>(null);
  const [isIndexing, setIsIndexing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const listenerRef = React.useRef<IndexListener | null>(null);

  const addPath = React.useCallback(() => {
    const trimmed = pathInput.trim();
    if (!trimmed || paths.includes(trimmed)) {
      return;
    }
    setPaths((prev) => [...prev, trimmed]);
    setPathInput("");
  }, [pathInput, paths]);

  const removePath = React.useCallback((value: string) => {
    setPaths((prev) => prev.filter((path) => path !== value));
  }, []);

  const pickFolder = React.useCallback(async () => {
    if (!isTauriRuntime()) {
      return;
    }
    const selection = await open({ directory: true, multiple: true });
    if (!selection) {
      return;
    }
    const selected = Array.isArray(selection) ? selection : [selection];
    setPaths((prev) => {
      const next = new Set(prev);
      for (const value of selected) {
        next.add(String(value));
      }
      return Array.from(next);
    });
  }, []);

  const clearError = React.useCallback(() => {
    setError(null);
  }, []);

  const handleIndex = React.useCallback(async () => {
    setError(null);
    if (!isAvailable || paths.length === 0) {
      setError("Add at least one path to index.");
      return;
    }

    setIsIndexing(true);
    setProgress({
      total_files: paths.length,
      processed_files: 0,
      current_file: "",
      status: { state: "indexing" },
    });

    listenerRef.current?.stop();
    listenerRef.current = await indexFiles(
      paths,
      { chunkSize: DEFAULT_CHUNK_SIZE, overlap: DEFAULT_CHUNK_OVERLAP },
      (next) => {
        setProgress(next);
        if (next.status.state === "error") {
          setError(next.status.message ?? "Indexing failed.");
          setIsIndexing(false);
          listenerRef.current?.stop();
        }
        if (next.status.state === "completed") {
          setIsIndexing(false);
          listenerRef.current?.stop();
          void refreshStats();
          void refreshRecent();
        }
      }
    );
  }, [indexFiles, isAvailable, paths, refreshRecent, refreshStats]);

  return {
    paths,
    pathInput,
    setPathInput,
    addPath,
    removePath,
    pickFolder,
    handleIndex,
    progress,
    isIndexing,
    error,
    clearError,
  } satisfies IndexingState;
}

function useSearchControls(options: {
  isAvailable: boolean;
  search: (query: { query: string; limit?: number }) => Promise<VectorSearchResult[]>;
}) {
  const { isAvailable, search } = options;
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<VectorSearchResult[]>([]);

  const handleSearch = React.useCallback(async () => {
    if (!isAvailable) {
      return;
    }
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      return;
    }
    const matches = await search({ query: trimmed, limit: 10 });
    setResults(matches);
  }, [isAvailable, query, search]);

  const clearResults = React.useCallback(() => {
    setResults([]);
  }, []);

  return { query, setQuery, results, handleSearch, clearResults } satisfies SearchState;
}

function useRecentControls(options: {
  isAvailable: boolean;
  deleteChunks: (args: { ids?: number[]; delete_all?: boolean }) => Promise<number>;
  refreshRecent: () => Promise<void>;
  refreshStats: () => Promise<void>;
  clearSearch: () => void;
}) {
  const { isAvailable, deleteChunks, refreshRecent, refreshStats, clearSearch } = options;

  const handleDelete = React.useCallback(
    async (id: number) => {
      if (!isAvailable) {
        return;
      }
      await deleteChunks({ ids: [id] });
      await refreshStats();
      await refreshRecent();
    },
    [deleteChunks, isAvailable, refreshRecent, refreshStats]
  );

  const handleClearAll = React.useCallback(async () => {
    if (!isAvailable) {
      return;
    }
    await deleteChunks({ delete_all: true });
    await refreshStats();
    await refreshRecent();
    clearSearch();
  }, [clearSearch, deleteChunks, isAvailable, refreshRecent, refreshStats]);

  return { handleDelete, handleClearAll } satisfies RecentState;
}

function StatsGrid({ statsState }: { statsState: StatsState }) {
  return (
    <div className="grid gap-3 text-xs text-muted-foreground sm:grid-cols-3">
      <div className="rounded-md border border-border bg-muted/30 p-3">
        <div className="text-[10px] uppercase tracking-wide">Chunks</div>
        <div className="mt-1 text-sm font-semibold text-foreground">
          {statsState?.total_chunks ?? 0}
        </div>
      </div>
      <div className="rounded-md border border-border bg-muted/30 p-3">
        <div className="text-[10px] uppercase tracking-wide">Files</div>
        <div className="mt-1 text-sm font-semibold text-foreground">
          {statsState?.total_files ?? 0}
        </div>
      </div>
      <div className="rounded-md border border-border bg-muted/30 p-3">
        <div className="text-[10px] uppercase tracking-wide">Last Updated</div>
        <div className="mt-1 text-sm font-semibold text-foreground">
          {statsState?.last_updated ? new Date(statsState.last_updated).toLocaleString() : "—"}
        </div>
      </div>
    </div>
  );
}

function PathPills({ paths, onRemove }: { paths: string[]; onRemove: (value: string) => void }) {
  if (paths.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">Add paths to build a local memory index.</p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {paths.map((path) => (
        <button
          key={path}
          type="button"
          className="rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-foreground"
          onClick={() => onRemove(path)}
          aria-label={`Remove ${path}`}
        >
          {path}
        </button>
      ))}
    </div>
  );
}

function ProgressCard({ progress }: { progress: IndexProgress | null }) {
  if (!progress) {
    return null;
  }

  return (
    <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
      <div className="flex items-center justify-between">
        <span>{progress.current_file ? `Indexing ${progress.current_file}` : "Indexing"}</span>
        <span>
          {progress.processed_files}/{progress.total_files}
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full bg-foreground transition-all",
            progress.status.state === "error" && "bg-destructive"
          )}
          style={{
            width:
              progress.total_files > 0
                ? `${(progress.processed_files / progress.total_files) * 100}%`
                : "0%",
          }}
        />
      </div>
      {progress.status.state === "error" ? (
        <p className="mt-2 text-xs text-destructive">{progress.status.message}</p>
      ) : null}
    </div>
  );
}

function SearchPanel(props: {
  query: string;
  setQuery: (value: string) => void;
  results: VectorSearchResult[];
  onSearch: () => Promise<void>;
}) {
  const { query, setQuery, results, onSearch } = props;
  const trimmed = query.trim();

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          className="text-input"
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search indexed memory"
          aria-label="Search memory"
        />
        <button type="button" className="button-secondary" onClick={onSearch}>
          Search
        </button>
      </div>

      {trimmed ? (
        results.length > 0 ? (
          <div className="space-y-2">
            {results.map((result) => (
              <div
                key={result.chunk.id}
                className="rounded-md border border-border bg-muted/30 p-3"
              >
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{result.chunk.file_path}</span>
                  <span>{result.score.toFixed(3)}</span>
                </div>
                <p className="mt-2 text-xs text-foreground">
                  {result.chunk.content.slice(0, 200)}
                  {result.chunk.content.length > 200 ? "…" : ""}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No matches found.</p>
        )
      ) : (
        <p className="text-xs text-muted-foreground">Enter a query to search.</p>
      )}
    </div>
  );
}

function RecentPanel(props: { recent: VectorChunk[]; onDelete: (id: number) => Promise<void> }) {
  const { recent, onDelete } = props;

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-foreground">Recent chunks</p>
      {recent.length === 0 ? (
        <p className="text-xs text-muted-foreground">No indexed chunks.</p>
      ) : (
        <div className="space-y-2">
          {recent.map((chunk) => (
            <div
              key={chunk.id}
              className="flex items-start justify-between gap-3 rounded-md border border-border bg-muted/30 p-3"
            >
              <div>
                <p className="text-xs text-muted-foreground">{chunk.file_path}</p>
                <p className="mt-1 text-xs text-foreground">
                  {chunk.content.slice(0, 140)}
                  {chunk.content.length > 140 ? "…" : ""}
                </p>
              </div>
              <button
                type="button"
                className="button-secondary"
                onClick={() => onDelete(chunk.id)}
                aria-label={`Delete chunk ${chunk.id}`}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function UnavailablePanel() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/40 p-3 text-xs text-muted-foreground">
      Open Wrap desktop (Tauri) is required to use local memory indexing.
    </div>
  );
}

function AvailablePanel(props: {
  statsState: StatsState;
  indexing: IndexingState;
  search: SearchState;
  recent: VectorChunk[];
  onClearAll: () => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  const { statsState, indexing, search, recent, onClearAll, onDelete } = props;

  return (
    <div className="space-y-4">
      <StatsGrid statsState={statsState} />

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="button-secondary" onClick={indexing.pickFolder}>
            Pick Folder
          </button>
          <div className="flex flex-1 items-center gap-2">
            <input
              className="text-input"
              type="text"
              value={indexing.pathInput}
              onChange={(event) => indexing.setPathInput(event.target.value)}
              placeholder="/Users/you/projects"
              aria-label="Add index path"
            />
            <button type="button" className="button-secondary" onClick={indexing.addPath}>
              Add
            </button>
          </div>
          <button
            type="button"
            className="button-primary"
            onClick={indexing.handleIndex}
            disabled={indexing.isIndexing || indexing.paths.length === 0}
          >
            {indexing.isIndexing ? "Indexing…" : "Index"}
          </button>
          <button
            type="button"
            className="button-secondary"
            onClick={onClearAll}
            disabled={indexing.isIndexing}
          >
            Clear All
          </button>
        </div>

        <PathPills paths={indexing.paths} onRemove={indexing.removePath} />

        <ProgressCard progress={indexing.progress} />

        {indexing.error ? <p className="text-xs text-destructive">{indexing.error}</p> : null}
      </div>

      <SearchPanel
        query={search.query}
        setQuery={search.setQuery}
        results={search.results}
        onSearch={search.handleSearch}
      />

      <RecentPanel recent={recent} onDelete={onDelete} />
    </div>
  );
}

export function LocalVectorStoreSection() {
  const { isAvailable, stats, listChunks, search, deleteChunks, indexFiles } = useVectorStore();
  const { statsState, refresh: refreshStats } = useVectorStats(isAvailable, stats);
  const { recent, refresh: refreshRecent } = useRecentChunks(isAvailable, listChunks);

  const indexing = useIndexingControls({
    isAvailable,
    indexFiles,
    refreshStats,
    refreshRecent,
  });

  const searchState = useSearchControls({ isAvailable, search });

  const { handleDelete, handleClearAll } = useRecentControls({
    isAvailable,
    deleteChunks,
    refreshRecent,
    refreshStats,
    clearSearch: searchState.clearResults,
  });

  const clearError = indexing.clearError;
  React.useEffect(() => {
    if (indexing.error) {
      const timeout = setTimeout(clearError, 6000);
      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [clearError, indexing.error]);

  return (
    <section className="card-panel space-y-4">
      <div>
        <p className="text-sm font-semibold text-foreground">Local Memory Store</p>
        <p className="text-xs text-muted-foreground">
          Index local files for semantic recall. Runs only in the desktop app.
        </p>
      </div>

      {isAvailable ? (
        <AvailablePanel
          statsState={statsState}
          indexing={indexing}
          search={searchState}
          recent={recent}
          onClearAll={handleClearAll}
          onDelete={handleDelete}
        />
      ) : (
        <UnavailablePanel />
      )}
    </section>
  );
}
