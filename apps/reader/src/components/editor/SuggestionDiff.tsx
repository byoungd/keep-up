import { cn } from "@ku0/shared/utils";
import { diff_match_patch } from "diff-match-patch";
import { Check, Split, X } from "lucide-react";
import { useMemo } from "react";

interface SuggestionDiffProps {
  originalText: string;
  suggestionText: string;
  onAccept: () => void;
  onReject: () => void;
  className?: string;
}

export function SuggestionDiff({
  originalText,
  suggestionText,
  onAccept,
  onReject,
  className,
}: SuggestionDiffProps) {
  const diffs = useMemo(() => {
    const dmp = new diff_match_patch();
    const d = dmp.diff_main(originalText, suggestionText);
    dmp.diff_cleanupSemantic(d);
    return d;
  }, [originalText, suggestionText]);

  return (
    <div
      className={cn(
        "flex flex-col gap-2 p-3 bg-surface-1 rounded-lg border border-border shadow-lg animate-in zoom-in-95",
        className
      )}
    >
      <div className="flex items-center justify-between pb-2 border-b border-border/50">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-accent-amber">
          <Split className="w-3.5 h-3.5" />
          <span>Merge Conflict Detected</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onReject}
            className="p-1 hover:bg-muted rounded-md transition-colors"
            title="Reject"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
          <button
            type="button"
            onClick={onAccept}
            className="p-1 hover:bg-accent-emerald/10 text-accent-emerald rounded-md transition-colors"
            title="Accept Merge"
          >
            <Check className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="text-sm font-mono leading-relaxed bg-surface-2 p-2 rounded border border-border/50 max-h-60 overflow-y-auto w-full">
        {diffs.map((part, index) => {
          const [type, text] = part;
          // Use index + type + substring for stable-ish key if content is unique enough, but index is okay here for static display
          const key = `${index}-${type}`;

          if (type === 0) {
            return (
              <span key={key} className="text-foreground/70">
                {text}
              </span>
            );
          }
          if (type === -1) {
            return (
              <span
                key={key}
                className="bg-destructive/15 text-destructive line-through decoration-destructive/50 px-0.5 rounded-sm"
              >
                {text}
              </span>
            );
          }
          if (type === 1) {
            return (
              <span
                key={key}
                className="bg-accent-emerald/15 text-accent-emerald font-medium px-0.5 rounded-sm"
              >
                {text}
              </span>
            );
          }
          return null;
        })}
      </div>

      <div className="text-[10px] text-muted-foreground text-center">
        Review the changes and accept to apply.
      </div>
    </div>
  );
}
