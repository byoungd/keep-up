import { useState } from "react";

interface DiffCardProps {
  file: string;
  diff: string; // Unified diff content
  status?: "pending" | "applied" | "reverted";
  appliedAt?: number;
  onApply?: () => Promise<void> | void;
  onRevert?: () => Promise<void> | void;
}

export function DiffCard({ file, diff, status, appliedAt, onApply, onRevert }: DiffCardProps) {
  const [busy, setBusy] = useState<"apply" | "revert" | null>(null);
  const [copied, setCopied] = useState(false);
  const hasActions = Boolean(onApply || onRevert);

  const handleApply = async () => {
    if (!onApply) {
      return;
    }
    setBusy("apply");
    try {
      await onApply();
    } finally {
      setBusy(null);
    }
  };

  const handleRevert = async () => {
    if (!onRevert) {
      return;
    }
    setBusy("revert");
    try {
      await onRevert();
    } finally {
      setBusy(null);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(diff);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-surface-1 border border-border rounded-xl shadow-sm my-4 overflow-hidden group hover:border-border transition-colors duration-fast">
      <div className="px-4 py-3 bg-muted border-b border-border flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-surface-1 border border-border rounded shadow-sm">
            <svg
              className="w-4 h-4 text-muted-foreground"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <title>File icon</title>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <div>
            <div className="text-micro text-muted-foreground/50 font-black uppercase tracking-widest leading-none mb-1">
              File Modification
            </div>
            <span className="font-mono text-chrome text-foreground font-bold tracking-tight">
              {file}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="p-1.5 rounded-lg border border-border bg-surface-1 text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-all duration-fast flex items-center gap-1.5"
            title="Copy diff to clipboard"
            aria-label="Copy diff to clipboard"
          >
            {copied ? (
              <svg
                className="w-3.5 h-3.5 text-success"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <title>Copied</title>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={3}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <title>Copy</title>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
                />
              </svg>
            )}
          </button>
          {hasActions &&
            (status !== "applied" ? (
              <button
                type="button"
                onClick={handleApply}
                className="text-xs font-black bg-foreground text-background px-3 py-1.5 rounded-lg shadow-sm hover:scale-105 active:scale-95 transition-all duration-fast uppercase tracking-tighter disabled:opacity-50"
                disabled={busy !== null || !onApply}
                aria-busy={busy === "apply"}
              >
                Apply
              </button>
            ) : (
              <button
                type="button"
                onClick={handleRevert}
                className="text-xs font-black bg-surface-2 text-foreground px-3 py-1.5 rounded-lg shadow-sm hover:scale-105 active:scale-95 transition-all duration-fast uppercase tracking-tighter disabled:opacity-50"
                disabled={busy !== null || !onRevert}
                aria-busy={busy === "revert"}
              >
                Revert
              </button>
            ))}
        </div>
        {status === "applied" && appliedAt && (
          <div className="text-micro text-muted-foreground">
            Applied {new Date(appliedAt).toLocaleString()}
          </div>
        )}
        {status === "reverted" && <div className="text-micro text-warning">Reverted</div>}
      </div>

      {/* Mock Diff Viewer - in production use Shiki/Prism */}
      <div
        className="overflow-x-auto p-0 text-fine font-mono bg-surface-1 leading-relaxed"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: Scrollable region needs keyboard access.
        tabIndex={0}
      >
        <table className="w-full border-collapse">
          <tbody>
            {diff.split("\n").map((line, cur) => {
              const isAdd = line.startsWith("+");
              const isDel = line.startsWith("-");
              return (
                <tr
                  key={`${cur}-${line.substring(0, 10)}`}
                  className={`${isAdd ? "bg-success/10" : isDel ? "bg-destructive/10" : ""}`}
                >
                  <td className="w-8 sticky left-0 bg-inherit text-right pr-2 text-muted-foreground/50 select-none border-r border-border user-select-none">
                    {cur + 1}
                  </td>
                  <td
                    className={`whitespace-pre px-2 ${isAdd ? "text-success" : isDel ? "text-destructive" : "text-muted-foreground"}`}
                  >
                    {line}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
