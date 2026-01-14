"use client";

import { cn } from "@ku0/shared/utils";
import { Gauge, Timer, Wifi, WifiOff, Zap } from "lucide-react";
import { useState } from "react";

export interface NetworkSimState {
  enabled: boolean;
  latencyMs: number;
  dropRate: number; // 0-1
  partitioned: boolean;
}

export interface NetworkStats {
  messagesSent: number;
  messagesReceived: number;
  bytesUp: number;
  bytesDown: number;
  lastLatencyMs: number;
}

export interface NetworkSectionProps {
  simState: NetworkSimState;
  stats: NetworkStats;
  onSimChange?: (state: NetworkSimState) => void;
  className?: string;
}

export function NetworkSection({ simState, stats, onSimChange, className }: NetworkSectionProps) {
  const [localSim, setLocalSim] = useState(simState);

  const updateSim = (updates: Partial<NetworkSimState>) => {
    const newState = { ...localSim, ...updates };
    setLocalSim(newState);
    onSimChange?.(newState);
  };

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) {
      return `${bytes}B`;
    }
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)}KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  return (
    <div className={cn("space-y-3", className)}>
      {/* Network Stats */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Zap className="h-3 w-3" />
          <span>Sent: {stats.messagesSent}</span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Zap className="h-3 w-3 rotate-180" />
          <span>Recv: {stats.messagesReceived}</span>
        </div>
        <div className="text-muted-foreground">↑ {formatBytes(stats.bytesUp)}</div>
        <div className="text-muted-foreground">↓ {formatBytes(stats.bytesDown)}</div>
        <div className="col-span-2 flex items-center gap-1.5 text-muted-foreground">
          <Timer className="h-3 w-3" />
          <span>Last RTT: {stats.lastLatencyMs}ms</span>
        </div>
      </div>

      {/* Simulation Controls (dev only) */}
      <div className="border-t pt-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium">Network Simulation</span>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={localSim.enabled}
              onChange={(e) => updateSim({ enabled: e.target.checked })}
              className="h-3 w-3"
            />
            <span className="text-xs text-muted-foreground">Enable</span>
          </label>
        </div>

        {localSim.enabled && (
          <>
            {/* Latency slider */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Gauge className="h-3 w-3" />
                  Latency
                </span>
                <span>{localSim.latencyMs}ms</span>
              </div>
              <input
                type="range"
                min="0"
                max="2000"
                step="50"
                value={localSim.latencyMs}
                onChange={(e) => updateSim({ latencyMs: Number(e.target.value) })}
                className="w-full h-1.5 accent-primary"
              />
            </div>

            {/* Drop rate slider */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Drop Rate</span>
                <span>{Math.round(localSim.dropRate * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={localSim.dropRate}
                onChange={(e) => updateSim({ dropRate: Number(e.target.value) })}
                className="w-full h-1.5 accent-primary"
              />
            </div>

            {/* Partition toggle */}
            <button
              type="button"
              onClick={() => updateSim({ partitioned: !localSim.partitioned })}
              className={cn(
                "w-full flex items-center justify-center gap-2 py-1.5 rounded text-xs font-medium",
                localSim.partitioned
                  ? "bg-destructive/15 text-destructive border border-destructive/30"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              {localSim.partitioned ? (
                <>
                  <WifiOff className="h-3.5 w-3.5" />
                  Partitioned (Click to Reconnect)
                </>
              ) : (
                <>
                  <Wifi className="h-3.5 w-3.5" />
                  Simulate Partition
                </>
              )}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
