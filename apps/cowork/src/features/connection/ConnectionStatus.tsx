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
        <div className="text-fine font-medium text-amber-600 flex items-center gap-2 px-2 py-1.5 rounded-lg bg-amber-500/5 border border-amber-500/10">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
          Reconnecting...
        </div>
      );
    }
    if (isConnected && !isLive && hasMessages) {
      return (
        <div className="text-fine font-medium text-amber-600 flex items-center gap-2 px-2 py-1.5 rounded-lg bg-amber-500/5 border border-amber-500/10">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          Connection Stalled
        </div>
      );
    }
    if (isConnected && isLive && hasMessages) {
      return (
        <div className="text-fine font-medium text-emerald-600 flex items-center gap-2 px-2 py-1.5 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Live
        </div>
      );
    }
    return null;
  }, [isConnected, isLive, hasMessages]);

  return status;
}
