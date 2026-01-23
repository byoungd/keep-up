import React from "react";
import { useVectorStore, type VectorSearchResult } from "../hooks/useVectorStore";

export function MemoryPanelContent() {
  const { isAvailable, search } = useVectorStore();
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<VectorSearchResult[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  const handleSearch = React.useCallback(async () => {
    setError(null);
    if (!isAvailable || !query.trim()) {
      setResults([]);
      return;
    }

    try {
      const matches = await search({ query: query.trim(), limit: 6 });
      setResults(matches);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    }
  }, [isAvailable, query, search]);

  if (!isAvailable) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Memory search is available in the desktop app.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="space-y-2">
        <p className="text-sm font-semibold text-foreground">Memory Search</p>
        <p className="text-xs text-muted-foreground">
          Query the local vector store to recall indexed context.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <input
          className="text-input"
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search memory"
          aria-label="Search memory"
        />
        <button type="button" className="button-secondary" onClick={handleSearch}>
          Search
        </button>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <div className="flex-1 space-y-2 overflow-y-auto">
        {results.length === 0 ? (
          <p className="text-xs text-muted-foreground">No results yet.</p>
        ) : (
          results.map((result) => (
            <div key={result.chunk.id} className="rounded-md border border-border bg-muted/30 p-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{result.chunk.file_path}</span>
                <span>{result.score.toFixed(3)}</span>
              </div>
              <p className="mt-2 text-xs text-foreground">
                {result.chunk.content.slice(0, 160)}
                {result.chunk.content.length > 160 ? "…" : ""}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
