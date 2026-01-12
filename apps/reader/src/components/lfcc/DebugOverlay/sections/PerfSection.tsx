"use client";
import { DebugSection } from "../DebugSection";
import type { DebugSnapshotPerf } from "../debugSnapshot";

interface PerfSectionProps {
  data: DebugSnapshotPerf;
}

export function PerfSection({ data }: PerfSectionProps) {
  const avg =
    data.avgResolutionDurationMs > 0 ? `${data.avgResolutionDurationMs.toFixed(2)} ms` : "n/a";
  const p95 =
    data.p95ResolutionDurationMs > 0 ? `${data.p95ResolutionDurationMs.toFixed(2)} ms` : "n/a";

  return (
    <DebugSection title="Perf">
      <div className="lfcc-debug-row">
        <span className="lfcc-debug-label">Drag/sec</span>
        <span className="lfcc-debug-value lfcc-debug-mono">
          {data.dragUpdatesPerSecond.toFixed(1)}
        </span>
      </div>
      <div className="lfcc-debug-row">
        <span className="lfcc-debug-label">Resolution/sec</span>
        <span className="lfcc-debug-value lfcc-debug-mono">
          {data.resolutionCallsPerSecond.toFixed(1)}
        </span>
      </div>
      <div className="lfcc-debug-row">
        <span className="lfcc-debug-label">Deco Rebuilds/sec</span>
        <span className="lfcc-debug-value lfcc-debug-mono">
          {data.decorationRebuildsPerSecond.toFixed(1)}
        </span>
      </div>
      <div className="lfcc-debug-divider" />
      <div className="lfcc-debug-row">
        <span className="lfcc-debug-label">Avg Resolution</span>
        <span className="lfcc-debug-value lfcc-debug-mono">{avg}</span>
      </div>
      <div className="lfcc-debug-row">
        <span className="lfcc-debug-label">P95 Resolution</span>
        <span className="lfcc-debug-value lfcc-debug-mono">{p95}</span>
      </div>
    </DebugSection>
  );
}
