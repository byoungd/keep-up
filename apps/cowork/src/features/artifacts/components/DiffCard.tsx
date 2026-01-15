import { useState } from "react";

interface DiffCardProps {
  file: string;
  diff: string; // Unified diff content
  onApply?: () => void;
}

export function DiffCard({ file, diff, onApply }: DiffCardProps) {
  const [isApplied, setIsApplied] = useState(false);

  const handleApply = () => {
    if (onApply) {
      onApply();
      setIsApplied(true);
    }
  };

  return (
    <div className="bg-surface border border-border rounded-xl shadow-sm my-4 overflow-hidden group hover:border-border transition-colors">
      <div className="px-4 py-3 bg-muted border-b border-border flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-surface border border-border rounded text-muted-foreground shadow-sm">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
            <div className="text-[10px] text-muted-foreground/70 font-bold uppercase tracking-wider leading-none mb-0.5">
              Modified File
            </div>
            <span className="font-mono text-sm text-foreground font-semibold">{file}</span>
          </div>
        </div>
        {!isApplied ? (
          <button
            type="button"
            onClick={handleApply}
            className="text-xs font-bold bg-foreground text-background px-3 py-1.5 rounded-lg shadow-sm hover:scale-105 active:scale-95 transition-all"
          >
            Apply Changes
          </button>
        ) : (
          <span className="text-xs text-success font-bold flex items-center gap-1.5 bg-success/10 px-2 py-1 rounded-lg border border-success/20">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <title>Applied icon</title>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={3}
                d="M5 13l4 4L19 7"
              />
            </svg>
            Applied
          </span>
        )}
      </div>

      {/* Mock Diff Viewer - in production use Shiki/Prism */}
      <div className="overflow-x-auto p-0 text-[11px] font-mono bg-surface leading-relaxed">
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
