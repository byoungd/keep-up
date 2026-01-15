import type * as React from "react";
import { cn } from "../../utils/cn";

export type NavItemRenderProps = {
  className: string;
  children: React.ReactNode;
  ariaCurrent?: "page";
};

export interface NavItemProps {
  href?: string;
  label: string;
  icon?: React.ReactNode;
  isActive?: boolean;
  badge?: number;
  shortcut?: string;
  density?: "compact" | "default" | "comfortable";
  className?: string;
  render?: (props: NavItemRenderProps) => React.ReactNode;
}

const DENSITY_STYLES = {
  compact: "py-1 px-2 text-xs gap-2",
  default: "py-1.5 px-3 text-sm gap-2.5",
  comfortable: "py-2 px-3 text-sm gap-3",
} as const;

export function NavItem({
  href,
  label,
  icon,
  isActive = false,
  badge,
  shortcut,
  density = "default",
  className,
  render,
}: NavItemProps) {
  const ariaCurrent = isActive ? "page" : undefined;
  const baseClassName = cn(
    "group flex items-center rounded-md font-medium transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    isActive
      ? "bg-primary/10 text-primary"
      : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
    DENSITY_STYLES[density],
    className
  );

  const content = (
    <>
      {icon ? (
        <span
          className={cn(
            "shrink-0 transition-colors",
            density === "compact" ? "h-3.5 w-3.5" : "h-4 w-4",
            isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
          )}
          aria-hidden="true"
        >
          {icon}
        </span>
      ) : null}
      <span className="truncate flex-1">{label}</span>
      {badge !== undefined && badge > 0 ? (
        <span className="ml-auto text-[10px] h-5 min-w-5 px-1.5 flex items-center justify-center bg-surface-3 text-muted-foreground rounded-full">
          {badge}
        </span>
      ) : null}
      {shortcut ? (
        <kbd className="ml-auto text-[10px] text-muted-foreground bg-surface-2 px-1.5 py-0.5 rounded border border-border/30">
          {shortcut}
        </kbd>
      ) : null}
    </>
  );

  if (render) {
    return render({ className: baseClassName, children: content, ariaCurrent });
  }

  if (href) {
    return (
      <a href={href} aria-current={ariaCurrent} className={baseClassName}>
        {content}
      </a>
    );
  }

  return (
    <button type="button" aria-current={ariaCurrent} className={baseClassName}>
      {content}
    </button>
  );
}
