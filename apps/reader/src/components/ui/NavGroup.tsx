"use client";

import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import * as React from "react";

export interface NavGroupProps {
  /** Group label/title */
  label: string;
  /** Unique identifier */
  id?: string;
  /** Whether the group can be collapsed */
  collapsible?: boolean;
  /** Controlled collapsed state */
  collapsed?: boolean;
  /** Callback when collapse state changes */
  onToggle?: () => void;
  /** Initial collapsed state (uncontrolled) */
  defaultCollapsed?: boolean;
  /** Children (NavItem components) */
  children: React.ReactNode;
  /** Additional class names */
  className?: string;
}

/**
 * NavGroup - A collapsible group of navigation items with a header.
 * Supports both controlled and uncontrolled collapse behavior.
 */
export function NavGroup({
  label,
  id,
  collapsible = true,
  collapsed: controlledCollapsed,
  onToggle,
  defaultCollapsed = false,
  children,
  className,
}: NavGroupProps) {
  const [internalCollapsed, setInternalCollapsed] = React.useState(defaultCollapsed);

  const isControlled = controlledCollapsed !== undefined;
  const isCollapsed = isControlled ? controlledCollapsed : internalCollapsed;

  const handleToggle = () => {
    if (onToggle) {
      onToggle();
    }
    if (!isControlled) {
      setInternalCollapsed((prev) => !prev);
    }
  };

  const listId = id ? `nav-group-${id}` : undefined;

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
          <ChevronRight
            className={cn("h-3 w-3 transition-transform duration-200", !isCollapsed && "rotate-90")}
          />
          <span>{label}</span>
        </button>
      ) : (
        <div className="px-2 py-1.5 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-wider">
          {label}
        </div>
      )}

      <AnimatePresence initial={false}>
        {!isCollapsed && (
          <motion.div
            id={listId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }} // smooth ease
            className="overflow-hidden"
          >
            <div className="space-y-0.5 pt-0.5 pb-1">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
