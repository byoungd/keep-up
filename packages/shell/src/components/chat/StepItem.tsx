import { cn } from "@ku0/shared/utils";
import { motion } from "framer-motion";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Circle,
  FileText,
  Loader2,
  Terminal,
} from "lucide-react";
import { TASK_THEME } from "./TaskStreamUtils";
import type { ActionItem, ArtifactItem, TaskStep } from "./types";

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: step item has many conditional UI states for accessibility
export function StepItem({
  step,
  isLast,
  isCollapsed,
  onToggle,
  actions,
  artifacts,
  onPreview,
  index,
}: {
  step: TaskStep;
  isLast: boolean;
  isCollapsed: boolean;
  onToggle: () => void;
  actions: ActionItem[];
  artifacts?: ArtifactItem[];
  onPreview?: (artifact: ArtifactItem) => void;
  index: number;
}) {
  const isActive = step.status === "running";
  const isCompleted = step.status === "completed";
  const isFailed = step.status === "failed";
  const hasDetails = actions.length > 0 || (artifacts?.length ?? 0) > 0;

  return (
    <div className="relative pl-0 py-2 group/step">
      {/* Thread Line */}
      {!isLast && (
        <div
          className={cn(
            "absolute left-[11px] top-[24px] bottom-[-8px] w-[1px] -z-10",
            "bg-gradient-to-b from-border/50 via-border/30 to-transparent"
          )}
        />
      )}

      {/* Step Header Row */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: Interactive step header */}
      {/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: Valid usage */}
      <div
        className={cn(
          "flex items-center gap-3 select-none px-2 py-1 rounded-md transition-all duration-normal",
          hasDetails
            ? "cursor-pointer hover:bg-surface-2/40 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
            : "",
          isActive && "bg-surface-2/20"
        )}
        onClick={hasDetails ? onToggle : undefined}
        onKeyDown={(e) => {
          if (hasDetails && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            onToggle();
          }
        }}
        role={hasDetails ? "button" : undefined}
        tabIndex={hasDetails ? 0 : undefined}
        aria-label={
          hasDetails
            ? isCollapsed
              ? `Expand step ${index + 1}: ${step.label}`
              : `Collapse step ${index + 1}: ${step.label}`
            : undefined
        }
        aria-expanded={hasDetails ? !isCollapsed : undefined}
      >
        {/* Icon */}
        <div className="shrink-0 flex items-center justify-center w-5 h-5 bg-background z-10 ring-4 ring-background">
          <StepIcon status={step.status} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className={TASK_THEME.type.stepIndex}>
                {(index + 1).toString().padStart(2, "0")}
              </span>
              <span
                className={cn(
                  TASK_THEME.type.stepLabel,
                  isActive ? "text-foreground" : "text-muted-foreground",
                  isCompleted &&
                    "text-muted-foreground/60 line-through decoration-muted-foreground/20",
                  isFailed && "text-error"
                )}
              >
                {step.label}
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {step.duration && (
                <span
                  className={cn(
                    TASK_THEME.type.meta,
                    "font-mono opacity-0 group-hover/step:opacity-100 transition-opacity duration-fast"
                  )}
                >
                  {step.duration}
                </span>
              )}
              {/* Hover Chevron */}
              {hasDetails && (
                <ChevronDown
                  className={cn(
                    "h-3 w-3 text-muted-foreground/30 transition-transform duration-normal",
                    !isCollapsed && "rotate-180",
                    "opacity-0 group-hover/step:opacity-100"
                  )}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Expanded Details (Tool Logs) */}
      {!isCollapsed && hasDetails && (
        <div className="ml-[11px] pl-[20px] pt-1 pb-1 space-y-1">
          <div className="pt-1 space-y-1.5 cursor-auto">
            {actions.map((action) => (
              <div
                key={action.id}
                className="flex items-start gap-2.5 text-fine text-muted-foreground/80 font-mono leading-relaxed"
              >
                <span className="mt-[3px] opacity-40 shrink-0">
                  {action.status === "running" ? (
                    <Loader2 className="h-2.5 w-2.5" />
                  ) : (
                    <Terminal className="h-2.5 w-2.5" />
                  )}
                </span>
                <span className="break-all">{action.label}</span>
              </div>
            ))}
            {/* File artifacts attached to step */}
            {artifacts?.map((art) => (
              <motion.button
                type="button"
                key={art.id}
                layoutId={`artifact-${art.id}`}
                transition={{ duration: 0.2, ease: "easeOut" }}
                onClick={(e) => {
                  e.stopPropagation();
                  onPreview?.(art);
                }}
                className="flex items-center gap-2 text-fine text-foreground/80 hover:text-primary hover:underline transition-colors duration-fast w-full text-left font-sans py-0.5"
              >
                <FileText className="h-3 w-3 opacity-60" />
                {art.title}
              </motion.button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Local StepIcon to reduce import complexity
function StepIcon({ status }: { status: TaskStep["status"] }) {
  if (status === "running") {
    return <Loader2 className="h-3.5 w-3.5 text-warning" />;
  }
  if (status === "failed") {
    return <AlertCircle className="h-3.5 w-3.5 text-error" />;
  }
  if (status === "completed") {
    return <CheckCircle2 className="h-3.5 w-3.5 text-primary/60" />;
  }
  return <Circle className="h-3.5 w-3.5 text-muted-foreground/30" />;
}
