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

// biome-ignore lint:complexity/noExcessiveCognitiveComplexity
export function ContextPacksPanel({ onClose }: { onClose: () => void }) {
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
    } catch (error) {
      setErrorMessage("Failed to load context packs.");
      // biome-ignore lint/suspicious/noConsole: Expected error logging
      console.error("Failed to load context packs", error);
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
    } catch (error) {
      setErrorMessage("Failed to load pinned packs.");
      // biome-ignore lint/suspicious/noConsole: Expected error logging
      console.error("Failed to load pinned packs", error);
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
    } catch (error) {
      setErrorMessage("Search failed. Ensure the context index is available.");
      // biome-ignore lint/suspicious/noConsole: Expected error logging
      console.error("Failed to search context", error);
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
    } catch (error) {
      setErrorMessage("Failed to create context pack.");
      // biome-ignore lint/suspicious/noConsole: Expected error logging
      console.error("Failed to create context pack", error);
    } finally {
      setIsSavingPack(false);
    }
  }, [packName, selectedChunkIds, loadPacks]);

  const handleStartRename = useCallback((pack: ContextPack) => {
    setEditingPackId(pack.id);
    setEditingPackName(pack.name);
  }, []);

  const handleCancelRename = useCallback(() => {
    setEditingPackId(null);
    setEditingPackName("");
  }, []);

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
    } catch (error) {
      setErrorMessage("Failed to rename context pack.");
      // biome-ignore lint/suspicious/noConsole: Expected error logging
      console.error("Failed to rename context pack", error);
    } finally {
      setIsSavingPack(false);
    }
  }, [editingPackId, editingPackName]);

  const handleReplaceSelection = useCallback(
    async (packId: string) => {
      if (selectedChunkIds.length === 0) {
        return;
      }
      setIsSavingPack(true);
      setErrorMessage(null);
      try {
        const updated = await updateContextPack(packId, { chunkIds: selectedChunkIds });
        setPacks((prev) => prev.map((pack) => (pack.id === updated.id ? updated : pack)));
        setSelectedChunkIds([]);
      } catch (error) {
        setErrorMessage("Failed to update context pack.");
        // biome-ignore lint/suspicious/noConsole: Expected error logging
        console.error("Failed to update context pack", error);
      } finally {
        setIsSavingPack(false);
      }
    },
    [selectedChunkIds]
  );

  const handleDeletePack = useCallback(
    async (packId: string) => {
      setIsSavingPack(true);
      setErrorMessage(null);
      try {
        await deleteContextPack(packId);
        setPacks((prev) => prev.filter((pack) => pack.id !== packId));
        await loadPins();
      } catch (error) {
        setErrorMessage("Failed to delete context pack.");
        // biome-ignore lint/suspicious/noConsole: Expected error logging
        console.error("Failed to delete context pack", error);
      } finally {
        setIsSavingPack(false);
      }
    },
    [loadPins]
  );

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
      } catch (error) {
        setErrorMessage("Failed to update pinned packs.");
        // biome-ignore lint/suspicious/noConsole: Expected error logging
        console.error("Failed to update pinned packs", error);
      } finally {
        setIsUpdatingPins(false);
      }
    },
    [pins?.packIds, resolvedSessionId]
  );

  return (
    <div className="flex flex-col h-full bg-surface-0 border-l border-border shadow-xl w-[640px] animate-in slide-in-from-right duration-300">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface-50/50 backdrop-blur-sm">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Context Packs</h2>
          <p className="text-xs text-muted-foreground">
            Search the project index and pin reusable snippets.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-2 hover:bg-surface-100 rounded-md text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Close context packs"
        >
          X
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {errorMessage ? (
          <div className="text-xs text-destructive bg-destructive/5 border border-destructive/10 px-3 py-2 rounded-md">
            {errorMessage}
          </div>
        ) : null}

        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void handleSearch();
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
                "px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 transition-colors shadow-sm",
                isSearching ? "opacity-70 cursor-wait" : ""
              )}
            >
              {isSearching ? "Searching..." : "Search"}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Results are ranked locally. Select chunks to build a new pack.
          </p>

          <div className="space-y-3">
            {isSearching ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="h-3 w-3 rounded-full border-2 border-muted-foreground border-t-transparent animate-spin" />
                Scanning index...
              </div>
            ) : null}
            {!isSearching && results.length === 0 && searchQuery.trim() ? (
              <p className="text-xs text-muted-foreground">No results yet.</p>
            ) : null}
            {results.map((result) => {
              const isSelected = selectedChunkIds.includes(result.chunk.id);
              return (
                <div
                  key={result.chunk.id}
                  className={cn(
                    "rounded-lg border border-border/40 bg-surface-50/70 p-3 space-y-2",
                    isSelected ? "ring-1 ring-primary/40" : ""
                  )}
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelection(result.chunk.id)}
                      aria-label={`Select chunk from ${result.chunk.sourcePath}`}
                      className="mt-1"
                    />
                    <div className="flex-1 space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-foreground">
                          {result.chunk.sourcePath}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          Score {result.score.toFixed(2)} | {result.chunk.tokenCount} tokens
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                        {formatSnippet(result.chunk.content)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="border-t border-border/40 pt-4 space-y-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{selectedChunkIds.length} chunks selected</span>
              {selectedChunkIds.length > 0 ? (
                <button
                  type="button"
                  onClick={clearSelection}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear selection
                </button>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={packName}
                onChange={(event) => setPackName(event.target.value)}
                placeholder="New pack name"
                className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                aria-label="Context pack name"
              />
              <button
                type="button"
                onClick={handleCreatePack}
                disabled={isSavingPack || selectedChunkIds.length === 0 || !packName.trim()}
                className={cn(
                  "px-4 py-2 text-sm font-medium text-primary-700 bg-primary-50 border border-primary-200 rounded-md hover:bg-primary-100 transition-colors",
                  isSavingPack || selectedChunkIds.length === 0 || !packName.trim()
                    ? "opacity-60 cursor-not-allowed"
                    : ""
                )}
              >
                Create Pack
              </button>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Saved Packs</h3>
              <p className="text-xs text-muted-foreground">
                Pin packs to inject them into this session.
              </p>
            </div>
            {isLoadingPacks ? (
              <span className="text-xs text-muted-foreground">Loading...</span>
            ) : null}
          </div>

          {!resolvedSessionId ? (
            <div className="text-xs text-muted-foreground border border-border/40 rounded-md p-3 bg-surface-50">
              Start a session to pin context packs.
            </div>
          ) : null}

          {sortedPacks.length === 0 && !isLoadingPacks ? (
            <div className="text-xs text-muted-foreground border border-border/40 rounded-md p-3 bg-surface-50">
              No packs yet. Search and create one to get started.
            </div>
          ) : null}

          {sortedPacks.map((pack) => {
            const isPinned = pinnedIds.has(pack.id);
            const isEditing = editingPackId === pack.id;
            return (
              <div
                key={pack.id}
                className="rounded-lg border border-border/40 bg-surface-50/70 p-3 space-y-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    {isEditing ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editingPackName}
                          onChange={(event) => setEditingPackName(event.target.value)}
                          className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                          aria-label="Rename context pack"
                        />
                        <button
                          type="button"
                          onClick={handleSaveRename}
                          disabled={isSavingPack || !editingPackName.trim()}
                          className="text-xs font-medium text-primary-700 hover:text-primary-900"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={handleCancelRename}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <p className="text-sm font-semibold text-foreground">{pack.name}</p>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      {pack.chunkIds.length} chunks | Updated {formatTimestamp(pack.updatedAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleTogglePin(pack.id)}
                      disabled={isUpdatingPins || !resolvedSessionId}
                      className={cn(
                        "px-3 py-1 text-xs font-semibold rounded-full border transition-colors",
                        isPinned
                          ? "bg-foreground text-background border-foreground"
                          : "text-foreground border-border hover:bg-surface-100"
                      )}
                    >
                      {isPinned ? "Pinned" : "Pin"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStartRename(pack)}
                      disabled={isSavingPack}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeletePack(pack.id)}
                      disabled={isSavingPack}
                      className="text-xs text-destructive hover:text-destructive/80"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                {selectedChunkIds.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => handleReplaceSelection(pack.id)}
                    disabled={isSavingPack}
                    className="text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    Replace with {selectedChunkIds.length} selected chunks
                  </button>
                ) : null}
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}
