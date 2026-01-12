"use client";
import { DebugSection } from "../DebugSection";
import type { DebugSnapshotDocument } from "../debugSnapshot";

interface DocumentSectionProps {
  data: DebugSnapshotDocument;
}

export function DocumentSection({ data }: DocumentSectionProps) {
  return (
    <DebugSection title="Document" defaultOpen>
      <div className="lfcc-debug-row">
        <span className="lfcc-debug-label">Doc ID</span>
        <span className="lfcc-debug-value lfcc-debug-mono">{data.docId || "n/a"}</span>
      </div>
      <div className="lfcc-debug-row">
        <span className="lfcc-debug-label">Doc Frontier</span>
        <span className="lfcc-debug-value lfcc-debug-mono" title={data.frontier}>
          {data.frontier ? `${data.frontier.slice(0, 16)}...` : "n/a"}
        </span>
      </div>
      <div className="lfcc-debug-row">
        <span className="lfcc-debug-label">Manifest Hash</span>
        <span className="lfcc-debug-value lfcc-debug-mono" title={data.manifestHash ?? undefined}>
          {data.manifestHash ? `${data.manifestHash.slice(0, 12)}...` : "n/a"}
        </span>
      </div>
      <div className="lfcc-debug-row">
        <span className="lfcc-debug-label">Anchor Encoding</span>
        <span className="lfcc-debug-value lfcc-debug-tag">
          {data.anchorEncodingVersion ?? "n/a"}
        </span>
      </div>
      <div className="lfcc-debug-row">
        <span className="lfcc-debug-label">Blocks</span>
        <span className="lfcc-debug-value">{data.blockCount}</span>
      </div>
      <div className="lfcc-debug-row">
        <span className="lfcc-debug-label">Last Tx Type</span>
        <span className="lfcc-debug-value lfcc-debug-tag">{data.lastTxType ?? "n/a"}</span>
      </div>
      <div className="lfcc-debug-row">
        <span className="lfcc-debug-label">Classification</span>
        <span className="lfcc-debug-value lfcc-debug-tag">
          {data.lastTxClassification ?? "n/a"}
        </span>
      </div>
      {data.lastTxTimestamp && (
        <div className="lfcc-debug-row">
          <span className="lfcc-debug-label">Tx Timestamp</span>
          <span className="lfcc-debug-value lfcc-debug-mono">{data.lastTxTimestamp}</span>
        </div>
      )}
    </DebugSection>
  );
}
