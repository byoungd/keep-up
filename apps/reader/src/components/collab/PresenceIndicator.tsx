/**
 * PresenceIndicator - Shows online collaborators in a compact format
 *
 * Displays avatars/initials with overflow count when more than 3 peers are present.
 */

"use client";

import type { PresencePeer } from "@/lib/lfcc/presenceStore";
import { cn } from "@/lib/utils";
import type * as React from "react";

interface PresenceIndicatorProps {
  /** List of remote peers */
  peers: PresencePeer[];
  /** Maximum number of avatars to show before overflow */
  maxVisible?: number;
  /** Additional CSS classes */
  className?: string;
}

/** Extract initials from display name */
function getInitials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return displayName.slice(0, 2).toUpperCase();
}

/** Avatar component for a single peer */
function PeerAvatar({
  peer,
  size = "sm",
}: {
  peer: PresencePeer;
  size?: "sm" | "md";
}): React.ReactElement {
  const sizeClasses = size === "sm" ? "h-6 w-6 text-[10px]" : "h-8 w-8 text-xs";

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full border-2 border-background font-medium",
        sizeClasses
      )}
      style={{ backgroundColor: peer.color, color: getContrastColor(peer.color) }}
      title={peer.displayName}
    >
      {getInitials(peer.displayName)}
    </div>
  );
}

/** Get contrasting text color for background */
function getContrastColor(hexColor: string): string {
  // Simple luminance check
  const hex = hexColor.replace("#", "");
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#000000" : "#ffffff";
}

export function PresenceIndicator({
  peers,
  maxVisible = 3,
  className,
}: PresenceIndicatorProps): React.ReactElement | null {
  if (peers.length === 0) {
    return null;
  }

  const visiblePeers = peers.slice(0, maxVisible);
  const overflowCount = peers.length - maxVisible;

  return (
    <div
      data-testid="presence-indicator"
      className={cn("flex items-center gap-1.5", className)}
      aria-label={`${peers.length} collaborator${peers.length === 1 ? "" : "s"} online`}
    >
      {/* Stacked avatars */}
      <div className="flex -space-x-2">
        {visiblePeers.map((peer) => (
          <PeerAvatar key={peer.clientId} peer={peer} />
        ))}
        {overflowCount > 0 && (
          <div
            className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-surface-2 text-[10px] font-medium text-muted-foreground"
            title={`${overflowCount} more`}
          >
            +{overflowCount}
          </div>
        )}
      </div>

      {/* Label */}
      <span className="text-xs text-muted-foreground">{peers.length} online</span>
    </div>
  );
}
