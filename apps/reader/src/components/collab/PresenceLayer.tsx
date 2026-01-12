"use client";

import { cn } from "@keepup/shared/utils";
import { useEffect, useRef } from "react";

import { getPresenceColorFromId } from "@/lib/theme/presenceColors";

export interface RemoteCursor {
  peerId: string;
  pos: number;
  // Selection range if any
  selectionFrom?: number;
  selectionTo?: number;
  // Last activity timestamp
  lastActive: number;
}

export interface PresenceLayerProps {
  cursors: RemoteCursor[];
  editorElement: HTMLElement | null;
  localPeerId: string;
  enabled?: boolean;
}

function getShortId(peerId: string): string {
  return peerId.slice(0, 4);
}

export function PresenceLayer({
  cursors,
  editorElement,
  localPeerId,
  enabled = true,
}: PresenceLayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled || !editorElement || !containerRef.current) {
      return;
    }

    // This is a placeholder for actual cursor rendering
    // In a real implementation, we would use ProseMirror decorations
    // or absolute positioning based on resolved positions
  }, [editorElement, enabled]);

  if (!enabled) {
    return null;
  }

  // Filter out local peer and stale cursors (> 30s inactive)
  const now = Date.now();
  const activeCursors = cursors.filter(
    (c) => c.peerId !== localPeerId && now - c.lastActive < 30000
  );

  if (activeCursors.length === 0) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden="true"
    >
      {activeCursors.map((cursor) => {
        const color = getPresenceColorFromId(cursor.peerId);
        const shortId = getShortId(cursor.peerId);

        // Placeholder rendering - actual positions need editor coordinates
        return (
          <div
            key={cursor.peerId}
            className="absolute"
            style={{
              // These would be calculated from actual editor positions
              left: 0,
              top: 0,
              display: "none", // Hidden until positions are calculated
            }}
          >
            {/* Cursor caret */}
            <div
              className="w-0.5 h-5 rounded-full animate-pulse"
              style={{ backgroundColor: color }}
            />
            {/* Peer label */}
            <div
              className={cn(
                "absolute -top-5 left-0 px-1.5 py-0.5 text-[10px] font-medium",
                "text-white rounded shadow-sm whitespace-nowrap"
              )}
              style={{ backgroundColor: color }}
            >
              {shortId}
            </div>
          </div>
        );
      })}
    </div>
  );
}
