"use client";
import { DebugSection } from "../DebugSection";
import type { DebugSnapshotFocus } from "../debugSnapshot";

interface FocusSectionProps {
  data: DebugSnapshotFocus;
}

export function FocusSection({ data }: FocusSectionProps) {
  return (
    <DebugSection title="Focus">
      <div className="lfcc-debug-row">
        <span className="lfcc-debug-label">Focused ID</span>
        <span className="lfcc-debug-value lfcc-debug-mono">
          {data.focusedAnnotationId ? `${data.focusedAnnotationId.slice(0, 8)}...` : "none"}
        </span>
      </div>
      <div className="lfcc-debug-row">
        <span className="lfcc-debug-label">Source</span>
        <span className="lfcc-debug-value">{data.focusSource ?? "n/a"}</span>
      </div>
      <div className="lfcc-debug-row">
        <span className="lfcc-debug-label">Decorations</span>
        <span className="lfcc-debug-value">{data.decorationCount}</span>
      </div>
      {data.orderingKeyPreview.length > 0 && (
        <div className="lfcc-debug-row">
          <span className="lfcc-debug-label">Order Keys</span>
          <div className="lfcc-debug-sublist">
            {data.orderingKeyPreview.slice(0, 5).map((key) => (
              <span key={key} className="lfcc-debug-mono lfcc-debug-small">
                {key.slice(0, 12)}...
              </span>
            ))}
          </div>
        </div>
      )}
    </DebugSection>
  );
}
