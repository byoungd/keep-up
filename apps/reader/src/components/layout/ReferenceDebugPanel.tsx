import { type ReferenceAnchor, resolveReferenceInState } from "@/lib/ai/referenceAnchors";
import type { EditorView } from "prosemirror-view";
import * as React from "react";
import type { Message } from "./MessageItem";

interface ReferenceDebugPanelProps {
  editorView?: EditorView | null;
  messages: Message[];
}

export function ReferenceDebugPanel({ editorView, messages }: ReferenceDebugPanelProps) {
  const stats = React.useMemo(() => {
    return calculateReferenceStats(editorView, messages);
  }, [editorView, messages]);

  if (!stats) {
    return null;
  }

  return (
    <div className="mx-4 mb-2 rounded-lg border border-border/40 bg-surface-2/60 px-3 py-2 text-[11px] text-muted-foreground">
      <div className="font-medium text-foreground">Anchor Debug</div>
      <div className="mt-1 flex flex-wrap gap-2">
        <span>Resolved: {stats.resolvedCount}</span>
        <span>Remapped: {stats.remappedCount}</span>
        <span>Unresolved: {stats.unresolvedCount}</span>
      </div>
    </div>
  );
}

function calculateReferenceStats(editorView: EditorView | null | undefined, messages: Message[]) {
  if (process.env.NODE_ENV === "production" || !editorView) {
    return null;
  }
  const allReferences: ReferenceAnchor[] = [];
  for (const message of messages) {
    if (message.references && message.references.length > 0) {
      allReferences.push(...message.references);
    }
  }
  if (allReferences.length === 0) {
    return null;
  }
  let resolvedCount = 0;
  let remappedCount = 0;
  let unresolvedCount = 0;
  for (const anchor of allReferences) {
    const result = resolveReferenceInState(anchor, editorView.state);
    if (result.status === "resolved") {
      resolvedCount += 1;
    } else if (result.status === "remapped") {
      remappedCount += 1;
    } else {
      unresolvedCount += 1;
    }
  }
  return { resolvedCount, remappedCount, unresolvedCount };
}
