import { useMemo } from "react";

interface ConnectionStatusProps {
  isConnected: boolean;
  isLive: boolean;
  hasMessages: boolean;
}

export function ConnectionStatus({ isConnected, isLive, hasMessages }: ConnectionStatusProps) {
  const status = useMemo(() => {
    if (!isConnected && hasMessages) {
      return (
        <div className="text-fine font-medium text-warning flex items-center gap-2 px-2 py-1.5 rounded-lg bg-warning/5 border border-warning/10">
          <span className="h-1.5 w-1.5 rounded-full bg-warning" />
          Reconnecting...
        </div>
      );
    }
    if (isConnected && !isLive && hasMessages) {
      return (
        <div className="text-fine font-medium text-warning flex items-center gap-2 px-2 py-1.5 rounded-lg bg-warning/5 border border-warning/10">
          <span className="h-1.5 w-1.5 rounded-full bg-warning" />
          Connection Stalled
        </div>
      );
    }
    if (isConnected && isLive && hasMessages) {
      return (
        <div className="text-fine font-medium text-success flex items-center gap-2 px-2 py-1.5 rounded-lg bg-success/5 border border-success/10">
          <span className="h-1.5 w-1.5 rounded-full bg-success" />
          Live
        </div>
      );
    }
    return null;
  }, [isConnected, isLive, hasMessages]);

  return status;
}
