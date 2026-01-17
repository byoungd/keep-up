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
        "flex items-center gap-2 px-2 py-1 rounded-md text-xs font-medium transition-colors border",
        mode === "plan"
          ? "bg-blue-500/5 text-blue-600 hover:bg-blue-500/10 border-blue-500/20 dark:text-blue-400"
          : "bg-orange-500/5 text-orange-600 hover:bg-orange-500/10 border-orange-500/20 dark:text-orange-400",
        className
      )}
      title={`Current mode: ${mode.toUpperCase()}. Click to switch to ${mode === "plan" ? "Build" : "Plan"} Mode. Build mode allows file modifications.`}
    >
      <span
        className={cn("w-2 h-2 rounded-full", mode === "plan" ? "bg-blue-500" : "bg-orange-500")}
      />
      {mode === "plan" ? "PLAN" : "BUILD"}
    </button>
  );
}
