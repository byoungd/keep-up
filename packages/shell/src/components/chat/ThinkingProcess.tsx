"use client";

import { cn } from "@ku0/shared/utils";
import { Brain } from "lucide-react";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "../ai-elements/reasoning";

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
  if (thinking.length === 0) {
    return null;
  }

  // Combine all thinking blocks for display
  const completedThinking = thinking.filter((t) => t.complete);

  if (completedThinking.length === 0) {
    return null;
  }

  const stepLabel =
    completedThinking.length === 1
      ? "Thinking process (1 step)"
      : `Thinking process (${completedThinking.length} steps)`;

  return (
    <Reasoning defaultOpen={defaultExpanded} className={cn("mt-3 ml-1", className)}>
      <ReasoningTrigger getThinkingMessage={() => stepLabel} />
      <ReasoningContent className="space-y-3">
        {completedThinking.map((block, idx) => (
          <ThinkingBlockItem key={`thinking-${idx}-${block.timestamp}`} block={block} />
        ))}
      </ReasoningContent>
    </Reasoning>
  );
}

/**
 * Individual thinking block.
 */
function ThinkingBlockItem({ block }: { block: ThinkingBlock }) {
  const TypeBadge = () => {
    const colors = {
      reasoning: "bg-info/20 text-info",
      planning: "bg-success/20 text-success",
      reflection: "bg-accent-violet/20 text-accent-violet",
    } as const;

    return (
      <span
        className={cn(
          "inline-flex items-center rounded px-1.5 py-0.5 text-tiny font-medium",
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
        <span className="text-micro text-muted-foreground">
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
        "inline-flex items-center gap-1.5 rounded-md bg-accent-violet/10 px-2 py-1 text-xs text-accent-violet",
        className
      )}
    >
      <Brain className="h-3 w-3 animate-pulse" aria-hidden="true" />
      <span className="animate-pulse">Thinking...</span>
    </div>
  );
}
