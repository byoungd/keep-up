"use client";

import { cn } from "@ku0/shared/utils";
import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";
import { Button } from "./Button";

export interface EmptyStateAction {
  label: string;
  onClick?: () => void;
  href?: string;
  variant?: "primary" | "outline" | "ghost";
  icon?: LucideIcon;
}

export interface EmptyStateProps {
  /** Icon to display (defaults to Inbox) */
  icon?: LucideIcon;
  /** Main title */
  title: string;
  /** Description text */
  description?: string;
  /** Action buttons */
  actions?: EmptyStateAction[];
  /** Additional CSS classes */
  className?: string;
  /** Size variant */
  size?: "sm" | "md" | "lg";
}

/**
 * Reusable empty state component for pages and sections.
 *
 * @example
 * ```tsx
 * <EmptyState
 *   icon={FileText}
 *   title="No documents yet"
 *   description="Import content or subscribe to feeds to get started."
 *   actions={[
 *     { label: "Import", onClick: handleImport, variant: "primary" },
 *     { label: "Add feed", href: "/feeds", variant: "outline" },
 *   ]}
 * />
 * ```
 */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  actions,
  className,
  size = "md",
}: EmptyStateProps) {
  const sizeStyles = {
    sm: {
      container: "max-w-xs space-y-3",
      iconWrapper: "w-10 h-10",
      icon: "h-5 w-5",
      title: "text-base",
      description: "text-xs",
    },
    md: {
      container: "max-w-sm space-y-4",
      iconWrapper: "w-12 h-12",
      icon: "h-6 w-6",
      title: "text-lg",
      description: "text-sm",
    },
    lg: {
      container: "max-w-md space-y-5",
      iconWrapper: "w-16 h-16",
      icon: "h-8 w-8",
      title: "text-xl",
      description: "text-base",
    },
  };

  const styles = sizeStyles[size];

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        styles.container,
        className
      )}
    >
      <div
        className={cn(
          "mx-auto rounded-full bg-surface-2 flex items-center justify-center",
          styles.iconWrapper
        )}
      >
        <Icon className={cn("text-muted-foreground", styles.icon)} aria-hidden="true" />
      </div>

      <h2 className={cn("font-medium", styles.title)}>{title}</h2>

      {description && (
        <p className={cn("text-muted-foreground", styles.description)}>{description}</p>
      )}

      {actions && actions.length > 0 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          {actions.map((action) => {
            const ActionIcon = action.icon;
            return (
              <Button
                key={action.label}
                variant={action.variant ?? "outline"}
                onClick={action.onClick}
                asChild={!!action.href}
                className="gap-2"
              >
                {action.href ? (
                  <a href={action.href}>
                    {ActionIcon && <ActionIcon className="h-4 w-4" aria-hidden="true" />}
                    {action.label}
                  </a>
                ) : (
                  <>
                    {ActionIcon && <ActionIcon className="h-4 w-4" aria-hidden="true" />}
                    {action.label}
                  </>
                )}
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}
