"use client";

import { cn } from "@keepup/shared/utils";

export type Collaborator = {
  id: string;
  name: string;
  color: string;
  avatarUrl?: string;
};

export type PresenceAvatarsProps = {
  collaborators: Collaborator[];
  maxVisible?: number;
};

/**
 * Collaborators presence indicator.
 * Shows avatars of active collaborators in the document.
 * UI-only state - reads from presence module, does not write to CRDT.
 */
export function PresenceAvatars({ collaborators, maxVisible = 3 }: PresenceAvatarsProps) {
  const visible = collaborators.slice(0, maxVisible);
  const overflow = collaborators.length - maxVisible;

  if (collaborators.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center -space-x-2">
      {visible.map((collab) => (
        <div
          key={collab.id}
          className={cn(
            "h-7 w-7 rounded-full border-2 border-background",
            "flex items-center justify-center text-xs font-medium text-white",
            "shadow-sm transition-transform hover:z-10 hover:scale-110"
          )}
          style={{ backgroundColor: collab.color }}
          title={collab.name}
        >
          {collab.avatarUrl ? (
            <img
              src={collab.avatarUrl}
              alt={collab.name}
              className="h-full w-full rounded-full object-cover"
            />
          ) : (
            collab.name.charAt(0).toUpperCase()
          )}
        </div>
      ))}
      {overflow > 0 && (
        <div
          className={cn(
            "h-7 w-7 rounded-full border-2 border-background",
            "flex items-center justify-center text-xs font-medium",
            "bg-muted text-muted-foreground shadow-sm"
          )}
          title={`${overflow} more`}
        >
          +{overflow}
        </div>
      )}
    </div>
  );
}
