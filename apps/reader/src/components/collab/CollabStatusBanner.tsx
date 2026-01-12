/**
 * CollabStatusBanner - Connection status banner with retry functionality
 *
 * Shows current connection state and provides recovery actions.
 * Extended to handle permission and token errors with appropriate CTAs.
 */

"use client";

import { cn } from "@/lib/utils";
import {
  AlertCircle,
  Clock,
  Link2Off,
  Loader2,
  Lock,
  RefreshCw,
  Wifi,
  WifiOff,
} from "lucide-react";
import type * as React from "react";

import { Button } from "@/components/ui/Button";
import type { CollabRole, CollabSessionState } from "@/hooks/useCollabSession";

/** Error codes from server */
export type CollabErrorCode =
  | "PERMISSION_DENIED"
  | "INVALID_TOKEN"
  | "EXPIRED_TOKEN"
  | "RATE_LIMITED"
  | "OFFLINE"
  | "UNKNOWN";

interface CollabStatusBannerProps {
  /** Current session state */
  state: CollabSessionState;
  /** Error message (if any) */
  error: string | null;
  /** Error code from server */
  errorCode?: CollabErrorCode;
  /** User's role */
  role?: CollabRole;
  /** Pending updates count */
  pendingUpdates: number;
  /** Retry callback */
  onRetry: () => void;
  /** Request access callback */
  onRequestAccess?: () => void;
  /** Request new link callback */
  onRequestNewLink?: () => void;
  /** Additional CSS classes */
  className?: string;
}

/** State configuration for display */
const stateConfig: Record<
  CollabSessionState,
  {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    variant: "success" | "warning" | "error" | "muted";
    showRetry: boolean;
  }
> = {
  connected: {
    icon: Wifi,
    label: "Connected",
    variant: "success",
    showRetry: false,
  },
  connecting: {
    icon: Loader2,
    label: "Connecting...",
    variant: "warning",
    showRetry: false,
  },
  reconnecting: {
    icon: RefreshCw,
    label: "Reconnecting...",
    variant: "warning",
    showRetry: false,
  },
  disconnected: {
    icon: WifiOff,
    label: "Offline",
    variant: "muted",
    showRetry: true,
  },
  error: {
    icon: AlertCircle,
    label: "Connection Error",
    variant: "error",
    showRetry: true,
  },
  idle: {
    icon: Loader2,
    label: "Initializing...",
    variant: "muted",
    showRetry: false,
  },
  disabled: {
    icon: WifiOff,
    label: "Single-user mode",
    variant: "muted",
    showRetry: false,
  },
};

const variantStyles: Record<string, string> = {
  success: "bg-success/10 text-success border-success/20",
  warning: "bg-warning/10 text-warning border-warning/20",
  error: "bg-error/10 text-error border-error/20",
  muted: "bg-surface-2 text-muted-foreground border-border/40",
};

/** Error code specific configurations */
const errorCodeConfig: Record<
  CollabErrorCode,
  {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    message: string;
    ctaLabel?: string;
    ctaAction?: "retry" | "requestAccess" | "requestNewLink";
    autoDismiss?: boolean;
  }
> = {
  PERMISSION_DENIED: {
    icon: Lock,
    label: "Access Denied",
    message: "You don't have permission to edit this document",
    ctaLabel: "Request access",
    ctaAction: "requestAccess",
  },
  INVALID_TOKEN: {
    icon: Link2Off,
    label: "Invalid Link",
    message: "This invite link is invalid or has been revoked",
    ctaLabel: "Request new link",
    ctaAction: "requestNewLink",
  },
  EXPIRED_TOKEN: {
    icon: Link2Off,
    label: "Link Expired",
    message: "This invite link has expired",
    ctaLabel: "Request new link",
    ctaAction: "requestNewLink",
  },
  RATE_LIMITED: {
    icon: Clock,
    label: "Syncing paused",
    message: "Your changes will catch up shortly",
    autoDismiss: true,
  },
  OFFLINE: {
    icon: WifiOff,
    label: "Offline",
    message: "You're currently offline",
    ctaLabel: "Retry",
    ctaAction: "retry",
  },
  UNKNOWN: {
    icon: AlertCircle,
    label: "Connection Error",
    message: "Something went wrong",
    ctaLabel: "Retry",
    ctaAction: "retry",
  },
};

export function CollabStatusBanner({
  state,
  error,
  errorCode,
  role: _role,
  pendingUpdates,
  onRetry,
  onRequestAccess,
  onRequestNewLink,
  className,
}: CollabStatusBannerProps): React.ReactElement | null {
  // Handle specific error codes first
  if (errorCode && errorCode !== "UNKNOWN" && errorCode !== "OFFLINE") {
    const errorConfig = errorCodeConfig[errorCode];
    const ErrorIcon = errorConfig.icon;

    // Use warning style for rate limited (non-spammy)
    const bannerVariant = errorCode === "RATE_LIMITED" ? "warning" : "error";

    const handleCta = () => {
      if (errorConfig.ctaAction === "requestAccess" && onRequestAccess) {
        onRequestAccess();
      } else if (errorConfig.ctaAction === "requestNewLink" && onRequestNewLink) {
        onRequestNewLink();
      } else if (errorConfig.ctaAction === "retry") {
        onRetry();
      }
    };

    return (
      <div
        data-testid="collab-status-banner"
        data-error-code={errorCode}
        className={cn(
          "flex items-center justify-between gap-3 rounded-lg border px-4 py-2.5",
          variantStyles[bannerVariant],
          className
        )}
        aria-live="polite"
      >
        <div className="flex items-center gap-2">
          <ErrorIcon className="h-4 w-4 shrink-0" />
          <div className="flex flex-col">
            <span className="text-sm font-medium">{errorConfig.label}</span>
            <span className="text-xs opacity-80">{errorConfig.message}</span>
          </div>
        </div>

        {errorConfig.ctaLabel && (
          <Button type="button" variant="ghost" size="sm" onClick={handleCta} className="shrink-0">
            {errorConfig.ctaLabel}
          </Button>
        )}
      </div>
    );
  }

  const config = stateConfig[state];
  const Icon = config.icon;
  const isAnimating = state === "connecting" || state === "reconnecting";

  // Don't show banner when connected with no issues
  if (state === "connected" && pendingUpdates === 0) {
    return null;
  }

  // Don't show when disabled (single-user mode) unless there's an error
  if (state === "disabled" && !error) {
    return null;
  }

  return (
    <div
      data-testid="collab-status-banner"
      className={cn(
        "flex items-center justify-between gap-3 rounded-lg border px-4 py-2.5",
        variantStyles[config.variant],
        className
      )}
      aria-live="polite"
    >
      <div className="flex items-center gap-2">
        <Icon className={cn("h-4 w-4 shrink-0", isAnimating && "animate-spin")} />
        <div className="flex flex-col">
          <span className="text-sm font-medium">{config.label}</span>
          {error && <span className="text-xs opacity-80 line-clamp-1">{error}</span>}
          {state === "connected" && pendingUpdates > 0 && (
            <span className="text-xs opacity-80">
              {pendingUpdates} update{pendingUpdates === 1 ? "" : "s"} syncing...
            </span>
          )}
        </div>
      </div>

      {config.showRetry && (
        <Button type="button" variant="ghost" size="sm" onClick={onRetry} className="shrink-0">
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Retry
        </Button>
      )}
    </div>
  );
}

/**
 * Compact inline version for header integration
 */
export function CollabStatusIndicator({
  state,
  pendingUpdates,
  className,
}: {
  state: CollabSessionState;
  pendingUpdates: number;
  className?: string;
}): React.ReactElement {
  const config = stateConfig[state];
  const Icon = config.icon;
  const isAnimating = state === "connecting" || state === "reconnecting";

  return (
    <div
      data-testid="connection-status"
      className={cn(
        "flex items-center gap-1.5 rounded-full border border-border/60 bg-surface-1/70 px-2.5 py-1 text-[11px] font-medium shadow-sm",
        className
      )}
    >
      <Icon
        className={cn(
          "h-3 w-3",
          config.variant === "success" && "text-success",
          config.variant === "warning" && "text-warning",
          config.variant === "error" && "text-error",
          config.variant === "muted" && "text-muted-foreground",
          isAnimating && "animate-spin"
        )}
      />
      <span className="text-foreground/80">{config.label}</span>
      {state === "connected" && pendingUpdates > 0 && (
        <span className="text-[10px] text-muted-foreground">({pendingUpdates} syncing)</span>
      )}
    </div>
  );
}
