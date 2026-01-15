import * as React from "react";
import { cn } from "../../utils/cn";

export interface NavGroupProps {
  label: string;
  id?: string;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
  defaultCollapsed?: boolean;
  children: React.ReactNode;
  className?: string;
  indicator?: React.ReactNode;
}

export function NavGroup({
  label,
  id,
  collapsible = true,
  collapsed: controlledCollapsed,
  onToggle,
  defaultCollapsed = false,
  children,
  className,
  indicator,
}: NavGroupProps) {
  const [internalCollapsed, setInternalCollapsed] = React.useState(defaultCollapsed);

  const isControlled = controlledCollapsed !== undefined;
  const isCollapsed = isControlled ? controlledCollapsed : internalCollapsed;
  const listId = id ? `nav-group-${id}` : undefined;

  const handleToggle = () => {
    if (onToggle) {
      onToggle();
    }
    if (!isControlled) {
      setInternalCollapsed((prev) => !prev);
    }
  };

  return (
    <div className={cn("space-y-1", className)}>
      {collapsible ? (
        <button
          type="button"
          onClick={handleToggle}
          aria-expanded={!isCollapsed}
          aria-controls={listId}
          className={cn(
            "flex items-center gap-2 w-full px-2 py-1.5 text-[11px] font-bold",
            "text-muted-foreground/80 hover:text-foreground transition-colors",
            "uppercase tracking-wider rounded-md",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          )}
        >
          <span className={cn("transition-transform", !isCollapsed && "rotate-90")}>
            {indicator ?? ">"}
          </span>
          <span>{label}</span>
        </button>
      ) : (
        <div className="px-2 py-1.5 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-wider">
          {label}
        </div>
      )}

      <div
        id={listId}
        className={cn(
          "overflow-hidden transition-all duration-200 ease-in-out",
          isCollapsed ? "max-h-0 opacity-0" : "max-h-[600px] opacity-100"
        )}
      >
        <div className="space-y-0.5 pt-0.5 pb-1">{children}</div>
      </div>
    </div>
  );
}
