import { cn } from "@ku0/shared/utils";
import type { AgentMode } from "../../../api/coworkApi";

interface ModeToggleProps {
  mode: AgentMode;
  onChange: (mode: AgentMode) => void;
  className?: string;
}

const MODE_OPTIONS: Array<{
  id: AgentMode;
  label: string;
  classes: string;
  dotClass: string;
  description: string;
}> = [
  {
    id: "plan",
    label: "PLAN",
    classes: "bg-info/5 text-info border-info/20 hover:bg-info/10",
    dotClass: "bg-info",
    description: "Read-only analysis and planning.",
  },
  {
    id: "build",
    label: "BUILD",
    classes: "bg-warning/5 text-warning border-warning/20 hover:bg-warning/10",
    dotClass: "bg-warning",
    description: "Full execution with write access.",
  },
  {
    id: "review",
    label: "REVIEW",
    classes:
      "bg-accent-indigo/5 text-accent-indigo border-accent-indigo/20 hover:bg-accent-indigo/10",
    dotClass: "bg-accent-indigo",
    description: "Read-only review and risk assessment.",
  },
];

export function ModeToggle({ mode, onChange, className }: ModeToggleProps) {
  return (
    <fieldset
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-border/40 bg-surface-1 p-1 text-[11px] font-bold uppercase tracking-wide shadow-sm",
        className
      )}
    >
      <legend className="sr-only">Agent mode</legend>
      {MODE_OPTIONS.map((option) => {
        const isActive = mode === option.id;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={cn(
              "flex items-center gap-1 rounded px-2 py-1 transition-colors duration-fast border",
              isActive ? option.classes : "border-transparent text-muted-foreground/70",
              !isActive && "hover:text-foreground hover:bg-surface-2/80"
            )}
            aria-pressed={isActive}
            title={`${option.label} mode. ${option.description}`}
          >
            <span
              className={cn("h-1.5 w-1.5 rounded-full", isActive ? option.dotClass : "bg-muted")}
            />
            {option.label}
          </button>
        );
      })}
    </fieldset>
  );
}
