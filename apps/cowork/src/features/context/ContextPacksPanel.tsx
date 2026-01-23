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

type SearchSectionProps = {
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onSearch: () => void;
  isSearching: boolean;
  results: ContextSearchResult[];
  selectedChunkIds: string[];
  onToggleSelection: (chunkId: string) => void;
  onClearSelection: () => void;
  packName: string;
  onPackNameChange: (value: string) => void;
  onCreatePack: () => void;
  isSavingPack: boolean;
};

function ContextPacksSearchSection({
  searchQuery,
  onSearchQueryChange,
  onSearch,
  isSearching,
  results,
  selectedChunkIds,
  onToggleSelection,
  onClearSelection,
  packName,
  onPackNameChange,
  onCreatePack,
  isSavingPack,
}: SearchSectionProps) {
  const hasQuery = searchQuery.trim().length > 0;
  const canCreate = selectedChunkIds.length > 0 && packName.trim().length > 0;

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              onSearch();
            }
          }}
          placeholder="Search codebase..."
          className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          aria-label="Search context packs"
        />
        <button
          type="button"
          onClick={onSearch}
          disabled={isSearching}
          className={cn(
            "px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 transition-colors duration-fast shadow-sm",
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
        {!isSearching && results.length === 0 && hasQuery ? (
          <p className="text-xs text-muted-foreground">No results yet.</p>
        ) : null}
        {results.map((result) => {
          const isSelected = selectedChunkIds.includes(result.chunk.id);
          return (
            <div
              key={result.chunk.id}
              className={cn(
                "rounded-lg border border-border/40 bg-surface-1/70 p-3 space-y-2",
                isSelected ? "ring-1 ring-primary/40" : ""
              )}
            >
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggleSelection(result.chunk.id)}
                  aria-label={`Select chunk from ${result.chunk.sourcePath}`}
                  className="mt-1"
                />
                <div className="flex-1 space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-foreground">
                      {result.chunk.sourcePath}
                    </p>
                    <p className="text-micro text-muted-foreground">
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
              onClick={onClearSelection}
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
            onChange={(event) => onPackNameChange(event.target.value)}
            placeholder="New pack name"
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            aria-label="Context pack name"
          />
          <button
            type="button"
            onClick={onCreatePack}
            disabled={isSavingPack || !canCreate}
            className={cn(
              "px-4 py-2 text-sm font-medium text-primary bg-primary/10 border border-primary/20 rounded-md hover:bg-primary/15 transition-colors duration-fast",
              isSavingPack || !canCreate ? "opacity-60 cursor-not-allowed" : ""
            )}
          >
            Create Pack
          </button>
        </div>
      </div>
    </section>
  );
}

type SavedSectionProps = {
  sortedPacks: ContextPack[];
  pinnedIds: Set<string>;
  isLoadingPacks: boolean;
  resolvedSessionId: string | null;
  editingPackId: string | null;
  editingPackName: string;
  onEditingPackNameChange: (value: string) => void;
  onStartRename: (pack: ContextPack) => void;
  onCancelRename: () => void;
  onSaveRename: () => void;
  onTogglePin: (packId: string) => void;
  onDeletePack: (packId: string) => void;
  onReplaceSelection: (packId: string) => void;
  selectedChunkIds: string[];
  isSavingPack: boolean;
  isUpdatingPins: boolean;
};

function ContextPacksSavedSection({
  sortedPacks,
  pinnedIds,
  isLoadingPacks,
  resolvedSessionId,
  editingPackId,
  editingPackName,
  onEditingPackNameChange,
  onStartRename,
  onCancelRename,
  onSaveRename,
  onTogglePin,
  onDeletePack,
  onReplaceSelection,
  selectedChunkIds,
  isSavingPack,
  isUpdatingPins,
}: SavedSectionProps) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Saved Packs</h3>
          <p className="text-xs text-muted-foreground">
            Pin packs to inject them into this session.
          </p>
        </div>
        {isLoadingPacks ? <span className="text-xs text-muted-foreground">Loading...</span> : null}
      </div>

      {!resolvedSessionId ? (
        <div className="text-xs text-muted-foreground border border-border/40 rounded-md p-3 bg-surface-1/70">
          Start a session to pin context packs.
        </div>
      ) : null}

      {sortedPacks.length === 0 && !isLoadingPacks ? (
        <div className="text-xs text-muted-foreground border border-border/40 rounded-md p-3 bg-surface-1/70">
          No packs yet. Search and create one to get started.
        </div>
      ) : null}

      {sortedPacks.map((pack) => {
        const isPinned = pinnedIds.has(pack.id);
        const isEditing = editingPackId === pack.id;
        return (
          <div
            key={pack.id}
            className="rounded-lg border border-border/40 bg-surface-1/70 p-3 space-y-3"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                {isEditing ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editingPackName}
                      onChange={(event) => onEditingPackNameChange(event.target.value)}
                      className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                      aria-label="Rename context pack"
                    />
                    <button
                      type="button"
                      onClick={onSaveRename}
                      disabled={isSavingPack || !editingPackName.trim()}
                      className="text-xs font-medium text-primary hover:text-primary/80 transition-colors duration-fast"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={onCancelRename}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <p className="text-sm font-semibold text-foreground">{pack.name}</p>
                )}
                <p className="text-fine text-muted-foreground">
                  {pack.chunkIds.length} chunks | Updated {formatTimestamp(pack.updatedAt)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onTogglePin(pack.id)}
                  disabled={isUpdatingPins || !resolvedSessionId}
                  className={cn(
                    "px-3 py-1 text-xs font-semibold rounded-full border transition-colors duration-fast",
                    isPinned
                      ? "bg-foreground text-background border-foreground"
                      : "text-foreground border-border hover:bg-surface-2"
                  )}
                >
                  {isPinned ? "Pinned" : "Pin"}
                </button>
                <button
                  type="button"
                  onClick={() => onStartRename(pack)}
                  disabled={isSavingPack}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Rename
                </button>
                <button
                  type="button"
                  onClick={() => onDeletePack(pack.id)}
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
                onClick={() => onReplaceSelection(pack.id)}
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
  );
}

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
    } catch (_error) {
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
    } catch (_error) {
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
    } catch (_error) {
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
    } catch (_error) {
      setErrorMessage("Failed to create context pack.");
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
    } catch (_error) {
      setErrorMessage("Failed to rename context pack.");
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
      } catch (_error) {
        setErrorMessage("Failed to update context pack.");
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
      } catch (_error) {
        setErrorMessage("Failed to delete context pack.");
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
      } catch (_error) {
        setErrorMessage("Failed to update pinned packs.");
      } finally {
        setIsUpdatingPins(false);
      }
    },
    [pins?.packIds, resolvedSessionId]
  );

  return (
    <div className="flex flex-col h-full bg-surface-0 border-l border-border/40 shadow-soft w-[640px] animate-in slide-in-from-right duration-200">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border/40 bg-surface-1">
        <div>
          <h2 className="text-base font-semibold text-foreground tracking-tight">Context Packs</h2>
          <p className="text-xs text-muted-foreground/90 leading-relaxed">
            Search the project index and pin reusable snippets.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-2 hover:bg-surface-2 rounded-md text-muted-foreground hover:text-foreground transition-colors duration-fast"
          aria-label="Close context packs"
        >
          ✕
        </button>
      </div>

      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: Scrollable region needs keyboard access. */}
      <div className="flex-1 overflow-y-auto scrollbar-auto-hide p-5 space-y-5" tabIndex={0}>
        {errorMessage ? (
          <div className="text-xs text-destructive bg-destructive/5 border border-destructive/10 px-3 py-2 rounded-md">
            {errorMessage}
          </div>
        ) : null}

        <ContextPacksSearchSection
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          onSearch={handleSearch}
          isSearching={isSearching}
          results={results}
          selectedChunkIds={selectedChunkIds}
          onToggleSelection={toggleSelection}
          onClearSelection={clearSelection}
          packName={packName}
          onPackNameChange={setPackName}
          onCreatePack={handleCreatePack}
          isSavingPack={isSavingPack}
        />

        <ContextPacksSavedSection
          sortedPacks={sortedPacks}
          pinnedIds={pinnedIds}
          isLoadingPacks={isLoadingPacks}
          resolvedSessionId={resolvedSessionId}
          editingPackId={editingPackId}
          editingPackName={editingPackName}
          onEditingPackNameChange={setEditingPackName}
          onStartRename={handleStartRename}
          onCancelRename={handleCancelRename}
          onSaveRename={handleSaveRename}
          onTogglePin={handleTogglePin}
          onDeletePack={handleDeletePack}
          onReplaceSelection={handleReplaceSelection}
          selectedChunkIds={selectedChunkIds}
          isSavingPack={isSavingPack}
          isUpdatingPins={isUpdatingPins}
        />
      </div>
    </div>
  );
}
