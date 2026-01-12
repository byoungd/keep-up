"use client";

import { useReducedMotion } from "@/lib/animations/useReducedMotion";
import type { SyncState } from "@/lib/collab/useSyncStatus";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { Cloud, CloudOff, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

type StatusConfig = {
  icon: typeof Cloud;
  label: string;
  dotColor: string;
  iconColor: string;
};

const statusConfig: Record<SyncState, StatusConfig> = {
  synced: {
    icon: Cloud,
    label: "Synced",
    dotColor: "bg-success",
    iconColor: "text-success",
  },
  reconnecting: {
    icon: Loader2,
    label: "Syncing",
    dotColor: "bg-warning",
    iconColor: "text-warning",
  },
  offline: {
    icon: CloudOff,
    label: "Offline",
    dotColor: "bg-error",
    iconColor: "text-error",
  },
};

export function SyncStatusIndicator({ status }: { status: SyncState }) {
  const config = statusConfig[status];
  const Icon = config.icon;
  const prefersReducedMotion = useReducedMotion();
  const [showSuccessPulse, setShowSuccessPulse] = useState(false);
  const [prevStatus, setPrevStatus] = useState(status);

  // Trigger success pulse when transitioning to synced
  useEffect(() => {
    if (status === "synced" && prevStatus !== "synced") {
      setShowSuccessPulse(true);
      const timer = setTimeout(() => setShowSuccessPulse(false), 600);
      return () => clearTimeout(timer);
    }
    setPrevStatus(status);
  }, [status, prevStatus]);

  // Determine animation variant based on status
  const getAnimationProps = () => {
    if (prefersReducedMotion) {
      return {};
    }

    switch (status) {
      case "synced":
        return {
          animate: showSuccessPulse
            ? { scale: [1, 1.3, 1], opacity: 1 }
            : { scale: [1, 1.05, 1], opacity: 1 },
          transition: showSuccessPulse
            ? { duration: 0.4, ease: "easeOut" as const }
            : { duration: 2, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" as const },
        };
      case "reconnecting":
        return {
          animate: { scale: [1, 1.15, 1], opacity: [1, 0.7, 1] },
          transition: {
            duration: 0.8,
            repeat: Number.POSITIVE_INFINITY,
            ease: "easeInOut" as const,
          },
        };
      case "offline":
        return {
          animate: { x: [-1, 1, -1, 1, 0] },
          transition: { duration: 0.4, ease: "easeInOut" as const },
        };
      default:
        return {};
    }
  };

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-2.5 py-1 rounded-lg text-xs font-medium",
        "bg-surface-1/60 border border-border/20 backdrop-blur-sm",
        "transition-colors duration-200"
      )}
      title={config.label}
    >
      {/* Animated status dot */}
      <div className="relative flex items-center justify-center w-4 h-4">
        <AnimatePresence mode="wait">
          <motion.span
            key={status}
            className={cn("w-2 h-2 rounded-full", config.dotColor)}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ duration: 0.15 }}
          />
        </AnimatePresence>

        {/* Breathing/pulse animation overlay */}
        {!prefersReducedMotion && (
          <motion.span
            className={cn("absolute inset-0 flex items-center justify-center")}
            {...getAnimationProps()}
          >
            <span className={cn("w-2 h-2 rounded-full", config.dotColor, "opacity-40")} />
          </motion.span>
        )}
      </div>

      {/* Icon with rotation for syncing */}
      <AnimatePresence mode="wait">
        <motion.span
          key={status}
          initial={{ opacity: 0, rotate: -10 }}
          animate={{
            opacity: 1,
            rotate: status === "reconnecting" && !prefersReducedMotion ? 360 : 0,
          }}
          exit={{ opacity: 0, rotate: 10 }}
          transition={
            status === "reconnecting" && !prefersReducedMotion
              ? {
                  rotate: { duration: 1, repeat: Number.POSITIVE_INFINITY, ease: "linear" },
                  opacity: { duration: 0.15 },
                }
              : { duration: 0.15 }
          }
        >
          <Icon className={cn("h-3.5 w-3.5", config.iconColor)} />
        </motion.span>
      </AnimatePresence>

      {/* Label with cross-fade */}
      <AnimatePresence mode="wait">
        <motion.span
          key={status}
          className="hidden sm:inline text-muted-foreground"
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 5 }}
          transition={{ duration: 0.15 }}
        >
          {config.label}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
