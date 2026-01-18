import { cn } from "@ku0/shared/utils";
import { ChevronRight } from "lucide-react";
import { ModelBadge } from "./ModelBadge";
import type { getStatusMeta } from "./TaskStreamUtils";
import type { AgentTask } from "./types";

export function TaskHeader({
  task,
  isExpanded,
  onToggle,
  statusMeta,
  elapsedLabel,
}: {
  task: AgentTask;
  isExpanded: boolean;
  onToggle: () => void;
  statusMeta: ReturnType<typeof getStatusMeta>;
  elapsedLabel?: string;
}) {
  return (
    <button
      type="button"
      className="flex items-center gap-3 w-full text-left py-1.5 px-0 hover:bg-transparent group/header focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-1 rounded-md transition-all active:scale-[0.995]"
      onClick={onToggle}
      aria-expanded={isExpanded}
    >
      <div
        className={cn(
          "h-5 w-5 rounded-md flex items-center justify-center transition-colors",
          statusMeta.bgClass,
          statusMeta.textClass
        )}
      >
        {statusMeta.icon}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground truncate tracking-[-0.01em]">
            {task.label || "Executing Task"}
          </span>

          {/* Subtle Status Badge - Linear Style */}
          <span
            className={cn(
              "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-fine font-medium transition-colors",
              statusMeta.badgeBg,
              statusMeta.textClass
            )}
          >
            {statusMeta.label}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-fine text-muted-foreground/70">
          {elapsedLabel && <span className="tabular-nums">Elapsed {elapsedLabel}</span>}
          <ModelBadge
            modelId={task.modelId}
            providerId={task.providerId}
            fallbackNotice={task.fallbackNotice}
            size="sm"
          />
        </div>
      </div>

      <div
        className={cn(
          "text-muted-foreground/50 transition-transform duration-200 p-1 opacity-0 group-hover/header:opacity-100",
          isExpanded && "opacity-100 rotate-90"
        )}
      >
        <ChevronRight className="h-4 w-4" />
      </div>
    </button>
  );
}
