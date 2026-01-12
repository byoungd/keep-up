/**
 * RoleBadge - Displays user's collaboration role
 *
 * Shows "Editor" or "View only" badge with appropriate styling.
 */

"use client";

import { cn } from "@/lib/utils";
import { Edit3, Eye } from "lucide-react";
import type * as React from "react";

import type { CollabRole } from "@/hooks/useCollabSession";

interface RoleBadgeProps {
  /** User's role in the session */
  role: CollabRole;
  /** Additional CSS classes */
  className?: string;
  /** Show icon */
  showIcon?: boolean;
}

const roleConfig: Record<
  Exclude<CollabRole, null>,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    variant: "editor" | "viewer" | "admin";
  }
> = {
  editor: {
    label: "Editor",
    icon: Edit3,
    variant: "editor",
  },
  viewer: {
    label: "View only",
    icon: Eye,
    variant: "viewer",
  },
  admin: {
    label: "Admin",
    icon: Edit3,
    variant: "admin",
  },
};

const variantStyles: Record<string, string> = {
  editor: "bg-primary/10 text-primary border-primary/20",
  viewer: "bg-muted text-muted-foreground border-border/40",
  admin: "bg-warning/10 text-warning border-warning/20",
};

/**
 * Badge showing user's collaboration role.
 */
export function RoleBadge({
  role,
  className,
  showIcon = true,
}: RoleBadgeProps): React.ReactElement | null {
  if (!role) {
    return null;
  }

  const config = roleConfig[role];
  const Icon = config.icon;

  return (
    <div
      data-testid="role-badge"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        variantStyles[config.variant],
        className
      )}
    >
      {showIcon && <Icon className="h-3 w-3" aria-hidden="true" />}
      <span>{config.label}</span>
    </div>
  );
}

/**
 * Compact role indicator for tight spaces.
 */
export function RoleIndicator({
  role,
  className,
}: {
  role: CollabRole;
  className?: string;
}): React.ReactElement | null {
  if (!role) {
    return null;
  }

  const config = roleConfig[role];
  const Icon = config.icon;

  return (
    <div
      data-testid="role-indicator"
      className={cn(
        "flex items-center justify-center rounded-full p-1",
        variantStyles[config.variant],
        className
      )}
      title={config.label}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="sr-only">{config.label}</span>
    </div>
  );
}
