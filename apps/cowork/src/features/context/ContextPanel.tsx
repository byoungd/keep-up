"use client";

import { cn } from "@ku0/shared/utils";
import type { ArtifactItem } from "@ku0/shell";
import { ArtifactPreviewPane } from "@ku0/shell";
import { useParams } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import * as React from "react";
import type { AgentMode } from "../../api/coworkApi";
import { ArtifactsList } from "../artifacts/components/ArtifactsList";
import { PreflightPanelContent } from "../preflight/PreflightPanelContent";
import { useTaskStream } from "../tasks/hooks/useTaskStream";
import { WorkflowTemplatesPanelContent } from "../workflows/WorkflowTemplatesPanelContent";
import { CheckpointsPanelContent } from "./CheckpointsPanelContent";
import { ContextPacksPanelContent } from "./ContextPacksPanelContent";
import { ProjectContextPanelContent } from "./ProjectContextPanelContent";

export type ContextPanelTab =
  | "context"
  | "packs"
  | "workflows"
  | "preflight"
  | "checkpoints"
  | "artifacts"
  | "notes"
  | "preview";

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
  /** Optional callback to toggle (hide) the panel */
  onToggle?: () => void;
  /** Callback to run a workflow template */
  onRunTemplate?: (
    prompt: string,
    mode: AgentMode,
    metadata?: Record<string, unknown>
  ) => Promise<void>;
}

const TAB_CONFIG: { id: ContextPanelTab; label: string }[] = [
  { id: "context", label: "Context" },
  { id: "packs", label: "Packs" },
  { id: "workflows", label: "Workflows" },
  { id: "preflight", label: "Preflight" },
  { id: "checkpoints", label: "Checkpoints" },
  { id: "artifacts", label: "Artifacts" },
  { id: "notes", label: "Notes" },
];

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
  onToggle: _onToggle,
  onRunTemplate,
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
    const tabs = [...TAB_CONFIG];
    if (previewArtifact) {
      tabs.push({ id: "preview", label: "Preview" });
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
      {/* Header with toggle button */}
      <div className="shrink-0 px-4 py-3 border-b border-border/40 bg-surface-0/90 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">Context Panel</p>
          <p className="text-xs text-muted-foreground">
            {sessionId ? `Session ${sessionId.slice(0, 8)}...` : "No active session"}
          </p>
        </div>
        {/* Toggle handled by Global Header */}
      </div>

      {/* Unified Tab Bar */}
      <div className="shrink-0 px-3 py-2 border-b border-border/20 flex items-center gap-1 overflow-x-auto scrollbar-auto-hide">
        {availableTabs.map((tab) => (
          <button
            type="button"
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "px-3 py-1.5 text-xs font-semibold rounded-full transition-colors duration-fast whitespace-nowrap",
              resolvedTab === tab.id
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground hover:bg-surface-2/60"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <section
        className="flex-1 min-h-0 overflow-y-auto scrollbar-auto-hide"
        aria-label="Context panel content"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: Scrollable region needs keyboard access.
        tabIndex={0}
      >
        {resolvedTab === "context" && <ProjectContextPanelContent />}

        {resolvedTab === "packs" && <ContextPacksPanelContent />}

        {resolvedTab === "workflows" && (
          <WorkflowTemplatesPanelContent onRunTemplate={onRunTemplate} />
        )}

        {resolvedTab === "preflight" && <PreflightPanelContent />}

        {resolvedTab === "checkpoints" && <CheckpointsPanelContent />}

        {resolvedTab === "artifacts" && (
          <div className="h-full">
            <ArtifactsList artifacts={graph.artifacts} />
          </div>
        )}

        {resolvedTab === "notes" && (
          <div className="h-full flex flex-col">
            {/* biome-ignore lint/a11y/noNoninteractiveTabindex: Scrollable region needs keyboard access. */}
            <div className="flex-1 overflow-y-auto scrollbar-auto-hide p-4 space-y-3" tabIndex={0}>
              {notes.length === 0 ? (
                <p className="text-sm text-muted-foreground">No notes yet.</p>
              ) : (
                notes.map((note) => (
                  <div
                    key={note.id}
                    className="rounded-lg border border-border/30 bg-surface-2/40 p-3 text-sm text-foreground"
                  >
                    <p className="whitespace-pre-wrap">{note.content}</p>
                    <p className="mt-2 text-micro text-muted-foreground">
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

        {resolvedTab === "preview" && (
          <div className="h-full">
            <AnimatePresence mode="sync">
              {previewArtifact ? (
                <ArtifactPreviewPane
                  key={previewArtifact.id}
                  item={previewArtifact}
                  onClose={onClosePreview}
                />
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="p-4 text-sm text-muted-foreground"
                >
                  No preview selected.
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </section>
    </section>
  );
}
