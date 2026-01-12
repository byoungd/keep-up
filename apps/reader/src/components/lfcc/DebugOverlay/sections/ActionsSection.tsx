"use client";

import * as React from "react";
import { DebugSection } from "../DebugSection";

interface ActionsSectionProps {
  onForceIntegrityScan: () => void;
  onDumpSnapshot: () => void;
  onDumpReproBundle?: () => void;
  onToggleOutlines?: () => void;
  isOutlinesEnabled?: boolean;
  lastScanResult: { ok: boolean; failureCount: number } | null;
}

export function ActionsSection({
  onForceIntegrityScan,
  onDumpSnapshot,
  onDumpReproBundle,
  onToggleOutlines,
  isOutlinesEnabled,
  lastScanResult,
}: ActionsSectionProps) {
  const [copyStatus, setCopyStatus] = React.useState<"idle" | "copied" | "error">("idle");
  const [reproStatus, setReproStatus] = React.useState<"idle" | "exported" | "error">("idle");

  const handleDumpSnapshot = () => {
    onDumpSnapshot();
    setCopyStatus("copied");
    setTimeout(() => setCopyStatus("idle"), 2000);
  };

  const handleDumpReproBundle = () => {
    if (!onDumpReproBundle) {
      return;
    }
    try {
      onDumpReproBundle();
      setReproStatus("exported");
      setTimeout(() => setReproStatus("idle"), 2000);
    } catch (_error) {
      setReproStatus("error");
      setTimeout(() => setReproStatus("idle"), 2000);
    }
  };
  const hasOutlineToggle =
    typeof onToggleOutlines === "function" && typeof isOutlinesEnabled === "boolean";

  return (
    <DebugSection title="Actions" defaultOpen>
      <div className="lfcc-debug-actions">
        <button type="button" className="lfcc-debug-btn" onClick={onForceIntegrityScan}>
          Force Full Integrity Scan
        </button>
        {lastScanResult && (
          <div
            className={`lfcc-debug-scan-result ${
              lastScanResult.ok ? "lfcc-debug-scan-result--ok" : "lfcc-debug-scan-result--fail"
            }`}
          >
            {lastScanResult.ok ? "OK" : `FAIL: ${lastScanResult.failureCount}`}
          </div>
        )}

        <button type="button" className="lfcc-debug-btn" onClick={handleDumpSnapshot}>
          Copy Debug Snapshot
        </button>
        {copyStatus === "copied" && (
          <div className="lfcc-debug-copy-status">Copied to clipboard.</div>
        )}

        {onDumpReproBundle && (
          <button type="button" className="lfcc-debug-btn" onClick={handleDumpReproBundle}>
            Dump Repro Bundle
          </button>
        )}
        {reproStatus === "exported" && <div className="lfcc-debug-copy-status">Exported</div>}
        {reproStatus === "error" && <div className="lfcc-debug-copy-status">Export failed</div>}

        {hasOutlineToggle && (
          <button
            type="button"
            className={`lfcc-debug-btn ${isOutlinesEnabled ? "lfcc-debug-btn--active" : ""}`}
            onClick={onToggleOutlines}
          >
            Toggle Decoration Outlines ({isOutlinesEnabled ? "on" : "off"})
          </button>
        )}
      </div>
    </DebugSection>
  );
}
