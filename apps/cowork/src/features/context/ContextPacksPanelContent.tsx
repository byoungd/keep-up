"use client";

import { cn } from "@ku0/shared/utils";
import { useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type ContextPack,
  type ContextPackPin,
  type ContextSearchResult,
  createContextPack,
  deleteContextPack,
  getContextPins,
  listContextPacks,
  searchContext,
  setContextPins,
  updateContextPack,
} from "../../api/coworkApi";

const SEARCH_LIMIT = 20;
const SNIPPET_LENGTH = 280;

function formatSnippet(content: string) {
  const trimmed = content.trim();
  if (trimmed.length <= SNIPPET_LENGTH) {
    return trimmed;
  }
  return `${trimmed.slice(0, SNIPPET_LENGTH)}...`;
}

function formatTimestamp(timestamp: number) {
  return new Date(timestamp).toLocaleString();
}

/**
 * Content-only version of ContextPacksPanel for embedding in ContextPanel tabs.
 */
export function ContextPacksPanelContent() {
  const { sessionId } = useParams({ strict: false }) as { sessionId?: string };
  const resolvedSessionId = sessionId && sessionId !== "undefined" ? sessionId : null;

  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<ContextSearchResult[]>([]);
  const [selectedChunkIds, setSelectedChunkIds] = useState<string[]>([]);
  const [packName, setPackName] = useState("");
  const [packs, setPacks] = useState<ContextPack[]>([]);
  const [pins, setPins] = useState<ContextPackPin | null>(null);
  const [editingPackId, setEditingPackId] = useState<string | null>(null);
  const [editingPackName, setEditingPackName] = useState("");
  const [isLoadingPacks, setIsLoadingPacks] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isSavingPack, setIsSavingPack] = useState(false);
  const [isUpdatingPins, setIsUpdatingPins] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const pinnedIds = useMemo(() => new Set(pins?.packIds ?? []), [pins]);
  const sortedPacks = useMemo(() => [...packs].sort((a, b) => b.updatedAt - a.updatedAt), [packs]);

  const loadPacks = useCallback(async () => {
    setIsLoadingPacks(true);
    setErrorMessage(null);
    try {
      const data = await listContextPacks();
      setPacks(data);
    } catch {
      setErrorMessage("Failed to load context packs.");
    } finally {
      setIsLoadingPacks(false);
    }
  }, []);

  const loadPins = useCallback(async () => {
    if (!resolvedSessionId) {
      setPins(null);
      return;
    }
    try {
      const data = await getContextPins(resolvedSessionId);
      setPins(data);
    } catch {
      setErrorMessage("Failed to load pinned packs.");
    }
  }, [resolvedSessionId]);

  useEffect(() => {
    loadPacks();
  }, [loadPacks]);

  useEffect(() => {
    loadPins();
  }, [loadPins]);

  const toggleSelection = useCallback((chunkId: string) => {
    setSelectedChunkIds((prev) => {
      if (prev.includes(chunkId)) {
        return prev.filter((id) => id !== chunkId);
      }
      return [...prev, chunkId];
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedChunkIds([]);
  }, []);

  const handleSearch = useCallback(async () => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      return;
    }
    setIsSearching(true);
    setErrorMessage(null);
    try {
      const data = await searchContext(trimmed, { limit: SEARCH_LIMIT });
      setResults(data);
      setSelectedChunkIds([]);
    } catch {
      setErrorMessage("Search failed. Ensure the context index is available.");
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery]);

  const handleCreatePack = useCallback(async () => {
    const trimmed = packName.trim();
    if (!trimmed || selectedChunkIds.length === 0) {
      return;
    }
    setIsSavingPack(true);
    setErrorMessage(null);
    try {
      await createContextPack({ name: trimmed, chunkIds: selectedChunkIds });
      setPackName("");
      setSelectedChunkIds([]);
      await loadPacks();
    } catch {
      setErrorMessage("Failed to create context pack.");
    } finally {
      setIsSavingPack(false);
    }
  }, [packName, selectedChunkIds, loadPacks]);

  const handleTogglePin = useCallback(
    async (packId: string) => {
      if (!resolvedSessionId) {
        setErrorMessage("Start a session to pin context packs.");
        return;
      }
      setIsUpdatingPins(true);
      setErrorMessage(null);
      const current = pins?.packIds ?? [];
      const next = current.includes(packId)
        ? current.filter((id) => id !== packId)
        : [...current, packId];
      try {
        const updated = await setContextPins(resolvedSessionId, next);
        setPins(updated);
      } catch {
        setErrorMessage("Failed to update pinned packs.");
      } finally {
        setIsUpdatingPins(false);
      }
    },
    [pins?.packIds, resolvedSessionId]
  );

  const handleDeletePack = useCallback(
    async (packId: string) => {
      setIsSavingPack(true);
      setErrorMessage(null);
      try {
        await deleteContextPack(packId);
        setPacks((prev) => prev.filter((pack) => pack.id !== packId));
        await loadPins();
      } catch {
        setErrorMessage("Failed to delete context pack.");
      } finally {
        setIsSavingPack(false);
      }
    },
    [loadPins]
  );

  const handleSaveRename = useCallback(async () => {
    if (!editingPackId) {
      return;
    }
    const trimmed = editingPackName.trim();
    if (!trimmed) {
      return;
    }
    setIsSavingPack(true);
    setErrorMessage(null);
    try {
      const updated = await updateContextPack(editingPackId, { name: trimmed });
      setPacks((prev) => prev.map((pack) => (pack.id === updated.id ? updated : pack)));
      setEditingPackId(null);
      setEditingPackName("");
    } catch {
      setErrorMessage("Failed to rename context pack.");
    } finally {
      setIsSavingPack(false);
    }
  }, [editingPackId, editingPackName]);

  const hasQuery = searchQuery.trim().length > 0;
  const canCreate = selectedChunkIds.length > 0 && packName.trim().length > 0;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto scrollbar-auto-hide p-4 space-y-6">
        {errorMessage ? (
          <div className="text-xs text-destructive bg-destructive/5 border border-destructive/10 px-3 py-2 rounded-md">
            {errorMessage}
          </div>
        ) : null}

        {/* Search Section */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  handleSearch();
                }
              }}
              placeholder="Search codebase..."
              className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              aria-label="Search context packs"
            />
            <button
              type="button"
              onClick={handleSearch}
              disabled={isSearching}
              className={cn(
                "px-3 py-2 text-xs font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 transition-colors duration-fast",
                isSearching ? "opacity-70 cursor-wait" : ""
              )}
            >
              {isSearching ? "..." : "Search"}
            </button>
          </div>

          {/* Results */}
          <div className="space-y-2">
            {isSearching ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="h-3 w-3 rounded-full border-2 border-muted-foreground border-t-transparent animate-spin" />
                Scanning...
              </div>
            ) : null}
            {!isSearching && results.length === 0 && hasQuery ? (
              <p className="text-xs text-muted-foreground">No results.</p>
            ) : null}
            {results.map((result) => {
              const isSelected = selectedChunkIds.includes(result.chunk.id);
              return (
                <div
                  key={result.chunk.id}
                  className={cn(
                    "rounded-lg border border-border/40 bg-surface-1/70 p-2 space-y-1",
                    isSelected ? "ring-1 ring-primary/40" : ""
                  )}
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelection(result.chunk.id)}
                      className="mt-1"
                    />
                    <div className="flex-1 space-y-0.5">
                      <p className="text-xs font-semibold text-foreground truncate">
                        {result.chunk.sourcePath}
                      </p>
                      <p className="text-micro text-muted-foreground whitespace-pre-wrap line-clamp-2">
                        {formatSnippet(result.chunk.content)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Create Pack */}
          {selectedChunkIds.length > 0 && (
            <div className="border-t border-border/40 pt-3 space-y-2">
              <p className="text-xs text-muted-foreground">{selectedChunkIds.length} selected</p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={packName}
                  onChange={(event) => setPackName(event.target.value)}
                  placeholder="Pack name"
                  className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                />
                <button
                  type="button"
                  onClick={handleCreatePack}
                  disabled={isSavingPack || !canCreate}
                  className="px-3 py-1.5 text-xs font-medium text-primary bg-primary/10 border border-primary/20 rounded-md hover:bg-primary/15 disabled:opacity-50"
                >
                  Create
                </button>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Saved Packs */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Saved Packs</h3>
            {isLoadingPacks && <span className="text-xs text-muted-foreground">Loading...</span>}
          </div>

          {sortedPacks.length === 0 && !isLoadingPacks ? (
            <p className="text-xs text-muted-foreground">No packs yet.</p>
          ) : null}

          {sortedPacks.map((pack) => {
            const isPinned = pinnedIds.has(pack.id);
            const isEditing = editingPackId === pack.id;
            return (
              <div
                key={pack.id}
                className="rounded-lg border border-border/40 bg-surface-1/70 p-2 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5 min-w-0">
                    {isEditing ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={editingPackName}
                          onChange={(e) => setEditingPackName(e.target.value)}
                          className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
                        />
                        <button
                          type="button"
                          onClick={handleSaveRename}
                          disabled={isSavingPack}
                          className="text-xs text-primary"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingPackId(null)}
                          className="text-xs text-muted-foreground"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <p className="text-xs font-semibold text-foreground truncate">{pack.name}</p>
                    )}
                    <p className="text-micro text-muted-foreground">
                      {pack.chunkIds.length} chunks · {formatTimestamp(pack.updatedAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleTogglePin(pack.id)}
                      disabled={isUpdatingPins || !resolvedSessionId}
                      className={cn(
                        "px-2 py-0.5 text-micro font-semibold rounded-full border transition-colors",
                        isPinned
                          ? "bg-foreground text-background border-foreground"
                          : "text-foreground border-border hover:bg-surface-2"
                      )}
                    >
                      {isPinned ? "Pinned" : "Pin"}
                    </button>
                    {!isEditing && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingPackId(pack.id);
                            setEditingPackName(pack.name);
                          }}
                          className="text-micro text-muted-foreground hover:text-foreground"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeletePack(pack.id)}
                          className="text-micro text-destructive"
                        >
                          ✕
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}
