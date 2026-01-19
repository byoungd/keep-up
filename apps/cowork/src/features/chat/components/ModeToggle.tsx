import { cn } from "@ku0/shared/utils";
import type { AgentMode } from "../../../api/coworkApi";

interface ModeToggleProps {
  mode: AgentMode;
  onToggle: () => void;
  className?: string;
}

export function ModeToggle({ mode, onToggle, className }: ModeToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "flex items-center gap-2 px-2 py-1 rounded-md text-xs font-medium transition-colors duration-fast border",
        mode === "plan"
          ? "bg-info/5 text-info hover:bg-info/10 border-info/20"
          : "bg-warning/5 text-warning hover:bg-warning/10 border-warning/20",
        className
      )}
      title={`Current mode: ${mode.toUpperCase()}. Click to switch to ${mode === "plan" ? "Build" : "Plan"} Mode. Build mode allows file modifications.`}
    >
      <span className={cn("w-2 h-2 rounded-full", mode === "plan" ? "bg-info" : "bg-warning")} />
      {mode === "plan" ? "PLAN" : "BUILD"}
    </button>
  );
}
