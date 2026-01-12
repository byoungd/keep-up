"use client";
import { DebugSection } from "../DebugSection";
import type { DebugSnapshotDirty } from "../debugSnapshot";

interface DirtySectionProps {
  data: DebugSnapshotDirty;
}

export function DirtySection({ data }: DirtySectionProps) {
  return (
    <DebugSection title="Dirty/Tx Classification">
      <div className="lfcc-debug-row">
        <span className="lfcc-debug-label">Touched Blocks</span>
        <span className="lfcc-debug-value">{data.touchedBlockIds.length}</span>
      </div>
      {data.touchedBlockIds.length > 0 && (
        <div className="lfcc-debug-sublist">
          {data.touchedBlockIds.slice(0, 3).map((id) => (
            <span key={id} className="lfcc-debug-mono lfcc-debug-small">
              {id.slice(0, 12)}...
            </span>
          ))}
          {data.touchedBlockIds.length > 3 && (
            <span className="lfcc-debug-muted">+{data.touchedBlockIds.length - 3} more</span>
          )}
        </div>
      )}
      <div className="lfcc-debug-row">
        <span className="lfcc-debug-label">Neighbor K</span>
        <span className="lfcc-debug-value">{data.neighborExpansionK}</span>
      </div>
      <div className="lfcc-debug-row">
        <span className="lfcc-debug-label">Reason</span>
        <span className="lfcc-debug-value lfcc-debug-tag">{data.reason ?? "n/a"}</span>
      </div>
      <div className="lfcc-debug-divider" />
      <div className="lfcc-debug-row">
        <span className="lfcc-debug-label">Spans Re-resolved</span>
        <span className="lfcc-debug-value">{data.spansReResolved}</span>
      </div>
      <div className="lfcc-debug-row">
        <span className="lfcc-debug-label">Annotations Re-verified</span>
        <span className="lfcc-debug-value">{data.annotationsReVerified}</span>
      </div>
    </DebugSection>
  );
}
