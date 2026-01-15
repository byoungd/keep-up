import { cn } from "@ku0/shared/utils";
import { Tooltip } from "../../../ui/Tooltip";

interface OptionCardProps {
  title: string;
  description?: string;
  selected: boolean;
  onSelect: () => void;
  preview?: React.ReactNode;
}

export function OptionCard({ title, description, selected, onSelect, preview }: OptionCardProps) {
  const tooltipContent = description?.trim();
  const button = (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={tooltipContent ? `${title} ${tooltipContent}` : title}
      className={cn(
        "flex items-center justify-between gap-2 rounded-xl border p-2 text-left transition-all h-full",
        selected
          ? "border-primary/50 bg-primary/5 shadow-sm"
          : "border-border/60 bg-surface-1 hover:bg-surface-2"
      )}
    >
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-sm font-medium text-foreground truncate">{title}</span>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <div className="opacity-80 grayscale transition-all group-hover:grayscale-0 group-hover:opacity-100">
          {preview}
        </div>
      </div>
    </button>
  );

  if (!tooltipContent) {
    return button;
  }

  return (
    <Tooltip content={tooltipContent} side="top" sideOffset={6}>
      {button}
    </Tooltip>
  );
}
