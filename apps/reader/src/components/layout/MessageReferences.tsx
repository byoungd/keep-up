"use client";

import type { ReferenceAnchor, ReferenceRange } from "@/lib/ai/referenceAnchors";
import { cn } from "@keepup/shared/utils";
import * as React from "react";

export interface MessageReferencesLabels {
  label: string;
  resolved: string;
  remapped: string;
  unresolved: string;
  find: string;
  unavailable: string;
}

export interface MessageReferencesProps {
  references: ReferenceAnchor[];
  resolveReference?: (anchor: ReferenceAnchor) => ReferenceRange;
  onReferenceSelect?: (anchor: ReferenceAnchor) => void;
  labels: MessageReferencesLabels;
}

/**
 * Displays reference anchors for assistant messages with resolution status.
 */
export const MessageReferences = React.memo(function MessageReferences({
  references,
  resolveReference,
  onReferenceSelect,
  labels,
}: MessageReferencesProps) {
  const resolvedReferences = React.useMemo(() => {
    if (!resolveReference) {
      return references.map((anchor) => ({ anchor, status: "unresolved" as const }));
    }
    return references.map((anchor) => ({
      anchor,
      ...resolveReference(anchor),
    }));
  }, [references, resolveReference]);

  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
        {labels.label}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {resolvedReferences.map((entry) => (
          <ReferenceChip
            key={entry.anchor.id}
            entry={entry}
            resolveAvailable={Boolean(resolveReference)}
            labels={labels}
            onSelect={() => onReferenceSelect?.(entry.anchor)}
          />
        ))}
      </div>
      {!resolveReference && (
        <div className="text-[10px] text-muted-foreground">{labels.unavailable}</div>
      )}
    </div>
  );
});

interface ReferenceChipProps {
  entry: ReferenceRange & { anchor: ReferenceAnchor };
  resolveAvailable: boolean;
  labels: Pick<MessageReferencesLabels, "resolved" | "remapped" | "unresolved" | "find">;
  onSelect?: () => void;
}

const ReferenceChip = React.memo(function ReferenceChip({
  entry,
  resolveAvailable,
  labels,
  onSelect,
}: ReferenceChipProps) {
  const label =
    entry.status === "resolved"
      ? labels.resolved
      : entry.status === "remapped"
        ? labels.remapped
        : labels.unresolved;

  const tone =
    entry.status === "resolved"
      ? "border-success/30 bg-success/10 text-success"
      : entry.status === "remapped"
        ? "border-warning/30 bg-warning/10 text-warning"
        : "border-border/50 bg-surface-0/80 text-muted-foreground";

  const snippet = entry.anchor.exactText.slice(0, 24);

  return (
    <button
      type="button"
      className={cn(
        "flex items-center gap-2 rounded-full border px-2 py-1 text-[10px] transition-colors",
        tone,
        resolveAvailable && "hover:border-primary/40 hover:bg-primary/5"
      )}
      onClick={onSelect}
      disabled={!resolveAvailable}
    >
      <span className="truncate max-w-[120px]">{snippet || entry.anchor.blockId}</span>
      <span className="opacity-80">{label}</span>
      {resolveAvailable && (
        <span className="rounded-full border border-transparent bg-background/70 px-1.5 py-0.5 text-[9px] uppercase">
          {labels.find}
        </span>
      )}
    </button>
  );
});
