"use client";

import { Highlighter } from "lucide-react";

export function AnnotationEmptyState() {
  return (
    <div className="rounded-xl border border-border/40 bg-linear-to-b from-muted/30 to-muted/10 p-8 shadow-sm flex flex-col items-center justify-center min-h-[200px] text-center">
      <div className="mb-4 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center animate-in zoom-in-50 duration-300">
        <Highlighter className="h-6 w-6 text-primary" />
      </div>

      <h3 className="mb-2 text-sm font-semibold text-foreground">No annotations yet</h3>
      <p className="max-w-[200px] text-xs text-muted-foreground leading-relaxed">
        Select text to add highlights and comments. They will appear here.
      </p>
    </div>
  );
}
