import { cn } from "@ku0/shared/utils";

interface SettingsSectionProps {
  id: string;
  label: string;
  children: React.ReactNode;
  className?: string;
  layout?: "inline" | "stacked";
  labelWidth?: string;
}

export function SettingsSection({
  id,
  label,
  children,
  className,
  layout = "inline",
  labelWidth = "7.5rem",
}: SettingsSectionProps) {
  const isStacked = layout === "stacked";
  return (
    <fieldset
      className={cn(
        "rounded-xl border border-border/40 bg-surface-1/30 p-3",
        isStacked ? "flex flex-col gap-2" : "grid items-center gap-2",
        className
      )}
      style={isStacked ? undefined : { gridTemplateColumns: `${labelWidth} 1fr` }}
      aria-labelledby={id}
    >
      <legend className="sr-only">{label}</legend>
      <span
        id={id}
        className={cn(
          "text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1",
          isStacked ? "self-start" : "truncate whitespace-nowrap self-center"
        )}
      >
        {label}
      </span>
      {children}
    </fieldset>
  );
}
