import { FileText } from "lucide-react";
import { useMemo } from "react";
import type { ArtifactItem } from "./types";

export function PlanSection({
  artifact,
  onPreview,
}: {
  artifact: ArtifactItem;
  onPreview?: (artifact: ArtifactItem) => void;
}) {
  const steps = useMemo(() => {
    try {
      return JSON.parse(artifact.content || "[]") as Array<{ label: string }>;
    } catch {
      return [];
    }
  }, [artifact.content]);

  if (!steps.length) {
    return null;
  }

  return (
    <div className="py-2">
      <button
        type="button"
        onClick={() => onPreview?.(artifact)}
        className="text-fine font-medium text-muted-foreground hover:text-foreground transition-colors duration-fast mb-1.5 flex items-center gap-1.5 select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 rounded-sm"
      >
        <FileText className="h-3 w-3" />
        Execution Strategy
      </button>
      <div className="pl-0.5 space-y-1">
        {steps.slice(0, 4).map((s, i) => (
          <div
            key={`${s.label}-${i}`}
            className="flex items-start gap-2.5 text-xs text-muted-foreground/80 leading-snug font-normal"
          >
            <span className="font-mono text-micro text-muted-foreground/40 mt-[1px] select-none">
              {(i + 1).toString().padStart(2, "0")}
            </span>
            <span>{s.label}</span>
          </div>
        ))}
        {steps.length > 4 && (
          <button
            type="button"
            className="pl-6 text-micro text-muted-foreground/40 mt-1 hover:text-primary cursor-pointer transition-colors duration-fast block text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 rounded-sm"
            onClick={() => onPreview?.(artifact)}
          >
            + {steps.length - 4} more steps
          </button>
        )}
      </div>
    </div>
  );
}
