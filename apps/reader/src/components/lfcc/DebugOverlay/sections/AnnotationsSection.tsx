"use client";

import * as React from "react";
import { DebugSection } from "../DebugSection";
import type { DebugSnapshotAnnotation } from "../debugSnapshot";

interface AnnotationsSectionProps {
  data: DebugSnapshotAnnotation[];
  onScrollTo?: (annotationId: string) => void;
}

function getStateClass(state: string): string {
  switch (state) {
    case "active":
      return "lfcc-debug-tag--ok";
    case "active_unverified":
    case "active_partial":
      return "lfcc-debug-tag--warn";
    case "orphan":
    case "broken_grace":
      return "lfcc-debug-tag--error";
    default:
      return "";
  }
}

export function AnnotationsSection({ data, onScrollTo }: AnnotationsSectionProps) {
  const [hoveredId, setHoveredId] = React.useState<string | null>(null);

  return (
    <DebugSection title="Annotations" badge={data.length.toString()}>
      {data.length === 0 ? (
        <div className="lfcc-debug-row lfcc-debug-muted">No annotations</div>
      ) : (
        <div className="lfcc-debug-anno-list">
          {data.map((anno) => (
            <button
              type="button"
              key={anno.id}
              className={`lfcc-debug-anno-row ${hoveredId === anno.id ? "lfcc-debug-anno-row--hover" : ""}`}
              onMouseEnter={() => setHoveredId(anno.id)}
              onMouseLeave={() => setHoveredId(null)}
              onClick={() => onScrollTo?.(anno.id)}
              title={`Click to scroll to annotation\nFull ID: ${anno.id}`}
            >
              <div className="lfcc-debug-anno-header">
                <span
                  className="lfcc-debug-anno-color"
                  style={{ backgroundColor: anno.color ?? "var(--color-accent-amber)" }}
                />
                <span className="lfcc-debug-mono lfcc-debug-small">{anno.shortId}</span>
                <span
                  className={`lfcc-debug-tag lfcc-debug-tag--sm ${getStateClass(anno.displayState)}`}
                >
                  {anno.displayState}
                </span>
              </div>
              <div className="lfcc-debug-anno-meta">
                <span>
                  {anno.verified ? "verified" : "unverified"}, {anno.spansCount} span
                  {anno.spansCount !== 1 ? "s" : ""}
                </span>
                {anno.resolvedBlockIds.length > 0 && (
                  <span className="lfcc-debug-mono lfcc-debug-small">
                    {"->"} {anno.resolvedBlockIds.slice(0, 2).join(", ")}
                    {anno.resolvedBlockIds.length > 2 ? "..." : ""}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </DebugSection>
  );
}
