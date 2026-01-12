"use client";

import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@keepup/shared/utils";
import { Pencil, Users } from "lucide-react";

import { getPresenceColorFromId } from "@/lib/theme/presenceColors";
export interface Peer {
  peerId: string;
  isTyping?: boolean;
  lastActive: number;
}

export interface PresenceListProps {
  peers: Peer[];
  localPeerId: string;
  className?: string;
}

function getShortId(peerId: string): string {
  return peerId.slice(0, 4);
}

export function PresenceList({ peers, localPeerId, className }: PresenceListProps) {
  // Filter out local peer and stale peers (> 30s inactive)
  const now = Date.now();
  const activePeers = peers.filter((p) => p.peerId !== localPeerId && now - p.lastActive < 30000);

  if (activePeers.length === 0) {
    return (
      <Tooltip content="You're the only one editing this document right now" side="bottom">
        <div
          className={cn(
            "flex items-center gap-1.5 text-xs text-muted-foreground cursor-help",
            className
          )}
        >
          <Users className="h-3.5 w-3.5" />
          <span>Just you (local)</span>
        </div>
      </Tooltip>
    );
  }

  const typingPeers = activePeers.filter((p) => p.isTyping);

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Users className="h-3.5 w-3.5" />
        <span>{activePeers.length + 1} online</span>
      </div>

      {/* Peer avatars */}
      <div className="flex -space-x-1.5">
        {activePeers.slice(0, 5).map((peer) => {
          const color = getPresenceColorFromId(peer.peerId);
          const shortId = getShortId(peer.peerId);

          return (
            <Tooltip key={peer.peerId} content={`Peer ${shortId}`} side="bottom">
              <div
                className={cn(
                  "h-6 w-6 rounded-full flex items-center justify-center",
                  "text-[10px] font-bold text-white border-2 border-background",
                  "cursor-default"
                )}
                style={{ backgroundColor: color }}
              >
                {shortId.charAt(0).toUpperCase()}
              </div>
            </Tooltip>
          );
        })}

        {activePeers.length > 5 && (
          <div
            className={cn(
              "h-6 w-6 rounded-full flex items-center justify-center",
              "text-[10px] font-medium bg-muted text-muted-foreground",
              "border-2 border-background"
            )}
          >
            +{activePeers.length - 5}
          </div>
        )}
      </div>

      {/* Typing indicator */}
      {typingPeers.length > 0 && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground animate-pulse">
          <Pencil className="h-3 w-3" />
          <span>
            {typingPeers.length === 1
              ? `${getShortId(typingPeers[0].peerId)} typing...`
              : `${typingPeers.length} typing...`}
          </span>
        </div>
      )}
    </div>
  );
}
