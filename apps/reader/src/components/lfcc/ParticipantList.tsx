"use client";

export interface Peer {
  clientId: string;
  displayName: string;
  color: string;
  lastSeen?: number;
  cursor?: { blockId: string; offset: number };
}

export interface ParticipantListProps {
  peers: Peer[];
  className?: string;
}

/**
 * Displays a list of active participants with colored avatars
 */
export function ParticipantList({ peers, className }: ParticipantListProps) {
  const handleSpawnReplica = () => {
    // Open current page in new tab for multi-replica testing
    window.open(window.location.href, "_blank");
  };

  if (peers.length === 0) {
    return (
      <div
        className={className}
        data-testid="presence-empty"
        style={{ display: "flex", alignItems: "center", gap: 4 }}
      >
        <span className="text-[11px] text-muted-foreground">Just you (local)</span>
        {process.env.NODE_ENV === "development" && (
          <button
            type="button"
            onClick={handleSpawnReplica}
            title="Open second replica in new tab"
            style={{
              width: 22,
              height: 22,
              borderRadius: "50%",
              backgroundColor: "transparent",
              border: "1.5px dashed var(--muted-foreground)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              cursor: "pointer",
              opacity: 0.6,
            }}
          >
            +
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className={className}
      style={{ display: "flex", alignItems: "center", gap: 4 }}
      data-testid="presence-list"
    >
      {peers.slice(0, 5).map((peer) => (
        <div
          key={peer.clientId}
          title={formatPeerTitle(peer)}
          className="text-on-accent"
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            backgroundColor: peer.color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 600,
            border: "2px solid var(--background)",
            marginLeft: -8,
          }}
        >
          {getInitials(peer.displayName)}
        </div>
      ))}
      {peers.length > 5 && (
        <div
          className="bg-muted text-muted-foreground"
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 10,
            fontWeight: 600,
            border: "2px solid var(--background)",
            marginLeft: -8,
          }}
        >
          +{peers.length - 5}
        </div>
      )}
      {process.env.NODE_ENV === "development" && (
        <button
          type="button"
          onClick={handleSpawnReplica}
          title="Open second replica in new tab"
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            backgroundColor: "transparent",
            border: "2px dashed var(--muted-foreground)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            cursor: "pointer",
            marginLeft: peers.length > 0 ? -8 : 0,
            opacity: 0.6,
          }}
        >
          +
        </button>
      )}
    </div>
  );
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function formatPeerTitle(peer: Peer): string {
  const shortId = peer.clientId.slice(0, 6);
  if (!peer.lastSeen) {
    return `${peer.displayName} (${shortId})`;
  }
  return `${peer.displayName} (${shortId}) • last seen ${new Date(peer.lastSeen).toLocaleTimeString()}`;
}
