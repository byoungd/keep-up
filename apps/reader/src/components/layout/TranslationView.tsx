import { cn } from "@keepup/shared/utils";
import { ArrowRight, Check, Copy } from "lucide-react";
import * as React from "react";

interface TranslationSegment {
  original: string;
  translation: string;
}

interface TranslationViewProps {
  originalText: string;
  translatedText: string;
  segments?: TranslationSegment[]; // For granular alignment if available
  className?: string;
}

export function TranslationView({
  originalText,
  translatedText,

  className,
}: TranslationViewProps) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    void navigator.clipboard.writeText(translatedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={cn(
        "w-full rounded-xl border border-border/50 bg-card overflow-hidden my-2",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border/50">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Translation
        </span>
        <button
          type="button"
          className="h-6 w-6 inline-flex items-center justify-center rounded-md hover:bg-surface-2 text-muted-foreground hover:text-foreground transition-all"
          onClick={handleCopy}
          title="Copy Translation"
        >
          {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
        </button>
      </div>

      {/* Content */}
      <div className="p-3 grid gap-4">
        {/* Simple split view for now */}
        <div className="grid gap-2">
          <div className="text-sm leading-relaxed text-muted-foreground bg-accent/5 p-2 rounded-lg border border-transparent">
            {originalText}
          </div>
          <div className="flex justify-center">
            <ArrowRight className="h-4 w-4 text-muted-foreground/30 rotate-90" />
          </div>
          <div className="text-sm leading-relaxed text-card-foreground bg-surface-1 p-2 rounded-lg border border-border/30 font-medium">
            {translatedText}
          </div>
        </div>
      </div>
    </div>
  );
}
