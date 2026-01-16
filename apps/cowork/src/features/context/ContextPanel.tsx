"use client";

import { cn } from "@ku0/shared/utils";
import { ArtifactPreviewPane } from "@ku0/shell";
import type { ArtifactItem } from "@ku0/shell";
import { useParams } from "@tanstack/react-router";
import * as React from "react";
import { ArtifactsList } from "../artifacts/components/ArtifactsList";
import { useTaskStream } from "../tasks/hooks/useTaskStream";

export type ContextPanelTab = "preview" | "artifacts" | "notes";

type ContextNote = {
  id: string;
  content: string;
  createdAt: number;
};

interface ContextPanelProps {
  activeTab: ContextPanelTab;
  onTabChange: (tab: ContextPanelTab) => void;
  previewArtifact: ArtifactItem | null;
  onClosePreview: () => void;
  position: "left" | "right";
}

const TAB_LABELS: Record<ContextPanelTab, string> = {
  preview: "Preview",
  artifacts: "Artifacts",
  notes: "Notes",
};

function getNotesKey(sessionId: string | undefined) {
  return `cowork-context-notes:${sessionId ?? "no-session"}`;
}

function loadNotes(key: string): ContextNote[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as ContextNote[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistNotes(key: string, notes: ContextNote[]): void {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.setItem(key, JSON.stringify(notes));
}

export function ContextPanel({
  activeTab,
  onTabChange,
  previewArtifact,
  onClosePreview,
  position,
}: ContextPanelProps) {
  const { sessionId } = useParams({ strict: false }) as { sessionId?: string };
  const { graph } = useTaskStream(sessionId ?? "");
  const storageKey = React.useMemo(() => getNotesKey(sessionId), [sessionId]);
  const [notes, setNotes] = React.useState<ContextNote[]>([]);
  const [draft, setDraft] = React.useState("");

  React.useEffect(() => {
    setNotes(loadNotes(storageKey));
  }, [storageKey]);

  const handleAddNote = React.useCallback(() => {
    const content = draft.trim();
    if (!content) {
      return;
    }
    const note: ContextNote = {
      id: crypto.randomUUID(),
      content,
      createdAt: Date.now(),
    };
    const next = [...notes, note];
    setNotes(next);
    persistNotes(storageKey, next);
    setDraft("");
  }, [draft, notes, storageKey]);

  const availableTabs = React.useMemo(() => {
    const tabs: ContextPanelTab[] = ["artifacts", "notes"];
    if (previewArtifact) {
      tabs.unshift("preview");
    }
    return tabs;
  }, [previewArtifact]);

  const resolvedTab = previewArtifact || activeTab !== "preview" ? activeTab : "artifacts";

  return (
    <section
      className={cn(
        "h-full flex flex-col bg-surface-1",
        position === "left" ? "border-r border-border/30" : "border-l border-border/30"
      )}
    >
      <div className="px-4 py-3 border-b border-border/40 bg-surface-0/90">
        <p className="text-sm font-semibold text-foreground">Context Panel</p>
        <p className="text-xs text-muted-foreground">
          {sessionId ? `Session ${sessionId.slice(0, 8)}...` : "No active session"}
        </p>
      </div>

      <div className="px-3 py-2 border-b border-border/20 flex items-center gap-2">
        {availableTabs.map((tab) => (
          <button
            type="button"
            key={tab}
            onClick={() => onTabChange(tab)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-colors ${
              resolvedTab === tab
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground hover:bg-surface-2/60"
            }`}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {resolvedTab === "preview" && (
          <div className="h-full">
            {previewArtifact ? (
              <ArtifactPreviewPane item={previewArtifact} onClose={onClosePreview} />
            ) : (
              <div className="p-4 text-sm text-muted-foreground">No preview selected.</div>
            )}
          </div>
        )}

        {resolvedTab === "artifacts" && (
          <div className="h-full">
            <ArtifactsList artifacts={graph.artifacts} />
          </div>
        )}

        {resolvedTab === "notes" && (
          <div className="h-full flex flex-col">
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {notes.length === 0 ? (
                <p className="text-sm text-muted-foreground">No notes yet.</p>
              ) : (
                notes.map((note) => (
                  <div
                    key={note.id}
                    className="rounded-lg border border-border/30 bg-surface-2/40 p-3 text-sm text-foreground"
                  >
                    <p className="whitespace-pre-wrap">{note.content}</p>
                    <p className="mt-2 text-[10px] text-muted-foreground">
                      {new Date(note.createdAt).toLocaleString()}
                    </p>
                  </div>
                ))
              )}
            </div>
            <div className="border-t border-border/20 p-3 space-y-2">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={3}
                className="w-full rounded-lg border border-border/40 bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40"
                placeholder="Add a note to this session..."
                aria-label="Add a note"
              />
              <button
                type="button"
                onClick={handleAddNote}
                className="w-full rounded-lg bg-foreground text-background text-sm font-semibold py-2 disabled:opacity-50"
                disabled={!draft.trim()}
                aria-label="Save note"
              >
                Save Note
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
