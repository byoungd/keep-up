"use client";
import { DebugSection } from "../DebugSection";
import type { DebugSnapshotSelection } from "../debugSnapshot";
import { truncateMessage } from "../debugSnapshot";

interface SelectionSectionProps {
  data: DebugSnapshotSelection;
}

export function SelectionSection({ data }: SelectionSectionProps) {
  return (
    <DebugSection title="Selection">
      <div className="lfcc-debug-row">
        <span className="lfcc-debug-label">PM Selection</span>
        <span className="lfcc-debug-value lfcc-debug-mono">
          {data.fromTo ? `${data.fromTo.from}->${data.fromTo.to}` : "empty"}
        </span>
      </div>
      <div className="lfcc-debug-row">
        <span className="lfcc-debug-label">Type</span>
        <span className="lfcc-debug-value">{data.selectionType}</span>
      </div>
      <div className="lfcc-debug-row">
        <span className="lfcc-debug-label">Mapping Mode</span>
        <span
          className={`lfcc-debug-value lfcc-debug-tag ${
            data.mappingMode === "strict" ? "lfcc-debug-tag--ok" : "lfcc-debug-tag--warn"
          }`}
        >
          {data.mappingMode}
        </span>
      </div>
      <div className="lfcc-debug-row">
        <span className="lfcc-debug-label">Spans</span>
        <span className="lfcc-debug-value">{data.spanList.length}</span>
      </div>
      <div className="lfcc-debug-row">
        <span className="lfcc-debug-label">Context Hash</span>
        <span className="lfcc-debug-value lfcc-debug-mono" title={data.contextHash ?? undefined}>
          {data.contextHash ? `${data.contextHash.slice(0, 12)}...` : "n/a"}
        </span>
      </div>
      {data.spanList.length > 0 && (
        <div className="lfcc-debug-sublist">
          {data.spanList.slice(0, 3).map((span) => (
            <div key={`${span.blockId}-${span.start}-${span.end}`} className="lfcc-debug-row">
              <span className="lfcc-debug-mono lfcc-debug-small">
                [{span.blockId.slice(0, 8)}...] {span.start}:{span.end}
              </span>
            </div>
          ))}
          {data.spanList.length > 3 && (
            <div className="lfcc-debug-row lfcc-debug-muted">+{data.spanList.length - 3} more</div>
          )}
        </div>
      )}
      {data.chainPolicy && (
        <div className="lfcc-debug-row">
          <span className="lfcc-debug-label">Chain Policy</span>
          <span className="lfcc-debug-value lfcc-debug-mono">
            {data.chainPolicy.kind} (max: {data.chainPolicy.maxInterveningBlocks})
          </span>
        </div>
      )}
      {data.lastError && (
        <div className="lfcc-debug-error">
          <div className="lfcc-debug-row">
            <span className="lfcc-debug-label">Error</span>
            <span className="lfcc-debug-value lfcc-debug-tag lfcc-debug-tag--error">
              {data.lastError.code}
            </span>
          </div>
          <div className="lfcc-debug-error-msg">{truncateMessage(data.lastError.message)}</div>
        </div>
      )}
    </DebugSection>
  );
}
