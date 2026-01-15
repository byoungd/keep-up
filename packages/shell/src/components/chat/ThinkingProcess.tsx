"use client";

import { cn } from "@ku0/shared/utils";
import { Brain, ChevronRight } from "lucide-react";
import * as React from "react";

export interface ThinkingBlock {
  content: string;
  type: "reasoning" | "planning" | "reflection";
  timestamp: number;
  complete: boolean;
}

export interface ThinkingProcessProps {
  thinking: ThinkingBlock[];
  className?: string;
  defaultExpanded?: boolean;
}

/**
 * Display AI thinking/reasoning process for thinking-enabled models.
 * Shows collapsible reasoning blocks with syntax highlighting.
 */
export function ThinkingProcess({
  thinking,
  className,
  defaultExpanded = false,
}: ThinkingProcessProps) {
  const [expanded, setExpanded] = React.useState(defaultExpanded);

  if (thinking.length === 0) {
    return null;
  }

  // Combine all thinking blocks for display
  const completedThinking = thinking.filter((t) => t.complete);

  if (completedThinking.length === 0) {
    return null;
  }

  return (
    <div className={cn("mt-3 ml-1", className)}>
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="group flex w-full items-center gap-2 px-2.5 py-2 text-xs font-medium text-muted-foreground/70 hover:text-foreground transition-all duration-300 rounded-lg hover:bg-surface-2/40"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2 transition-transform duration-300">
          <ChevronRight
            className={cn(
              "h-3.5 w-3.5 opacity-60 group-hover:opacity-100 transition-all duration-300",
              expanded && "rotate-90"
            )}
            aria-hidden="true"
          />
          <Brain className="h-3.5 w-3.5 opacity-60 group-hover:opacity-80" aria-hidden="true" />
          <span className="font-medium">Thinking Process</span>
        </div>
        {!expanded && (
          <span className="text-[10px] text-muted-foreground/40 bg-surface-2/60 px-2 py-0.5 rounded-full border border-border/20 font-mono">
            {completedThinking.length} step{completedThinking.length !== 1 ? "s" : ""}
          </span>
        )}
      </button>

      {/* Thinking Content */}
      {expanded && (
        <div className="pl-5 ml-2 border-l-2 border-border/30 space-y-4 py-3 animate-in fade-in slide-in-from-top-2 duration-300 ease-out">
          {completedThinking.map((block, idx) => (
            <ThinkingBlockItem key={`thinking-${idx}-${block.timestamp}`} block={block} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Individual thinking block.
 */
function ThinkingBlockItem({ block }: { block: ThinkingBlock }) {
  const TypeBadge = () => {
    const colors = {
      reasoning: "bg-blue-500/20 text-blue-500",
      planning: "bg-green-500/20 text-green-500",
      reflection: "bg-purple-500/20 text-purple-500",
    } as const;

    return (
      <span
        className={cn(
          "inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-medium",
          colors[block.type]
        )}
      >
        {block.type}
      </span>
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <TypeBadge />
        <span className="text-[10px] text-muted-foreground">
          {new Date(block.timestamp).toLocaleTimeString()}
        </span>
      </div>
      <div className="rounded-md bg-surface-2/50 p-2 text-xs leading-relaxed text-foreground/90 whitespace-pre-wrap font-mono">
        {block.content}
      </div>
    </div>
  );
}

/**
 * Inline thinking indicator (for streaming thinking).
 */
export function ThinkingIndicatorInline({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md bg-purple-500/10 px-2 py-1 text-xs text-purple-500",
        className
      )}
    >
      <Brain className="h-3 w-3 animate-pulse" aria-hidden="true" />
      <span className="animate-pulse">Thinking...</span>
    </div>
  );
}
