import { Button } from "@/components/ui/Button";
import { Users } from "lucide-react";

export function ReplicaManager() {
  const openReplica = () => {
    // Generate a random peer ID for the new replica
    const peerId = Math.floor(Math.random() * 10000).toString();
    const url = new URL(window.location.href);
    url.searchParams.set("peerId", peerId);
    window.open(url.toString(), "_blank");
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-8 gap-2"
      onClick={openReplica}
      title="Open a new tab with a different peer ID"
    >
      <Users className="h-4 w-4" />
      <span>New Replica</span>
    </Button>
  );
}
