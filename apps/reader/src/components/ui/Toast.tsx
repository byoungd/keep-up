"use client";

import { useReducedMotion } from "@/lib/animations/useReducedMotion";
import { registerGlobalToast, unregisterGlobalToast } from "@/lib/errors/notify";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Check, Info, X } from "lucide-react";
import * as React from "react";

export type ToastType = "success" | "error" | "info" | "warning";

/** Duration in ms before toast auto-dismisses */
const TOAST_DURATION = 4000;

interface ToastData {
  id: string;
  message: string;
  type: ToastType;
  createdAt: number;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const context = React.useContext(ToastContext);
  if (!context) {
    // Return a no-op if not wrapped in provider (graceful fallback)
    // biome-ignore lint/suspicious/noEmptyBlockStatements: Graceful fallback
    return { toast: () => {} };
  }
  return context;
}

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <Check className="h-4 w-4" />,
  error: <X className="h-4 w-4" />,
  warning: <AlertCircle className="h-4 w-4" />,
  info: <Info className="h-4 w-4" />,
};

const STYLES: Record<ToastType, string> = {
  success: "border-l-4 border-l-success",
  error: "border-l-4 border-l-error",
  warning: "border-l-4 border-l-warning",
  info: "border-l-4 border-l-info",
};

const PROGRESS_COLORS: Record<ToastType, string> = {
  success: "bg-success",
  error: "bg-error",
  warning: "bg-warning",
  info: "bg-info",
};

/** Individual toast item with progress bar and hover-pause */
function ToastItem({
  data,
  onDismiss,
  prefersReducedMotion,
}: {
  data: ToastData;
  onDismiss: (id: string) => void;
  prefersReducedMotion: boolean;
}) {
  const [isPaused, setIsPaused] = React.useState(false);
  const [progress, setProgress] = React.useState(100);
  const remainingTimeRef = React.useRef(TOAST_DURATION);

  // Progress countdown with pause support
  React.useEffect(() => {
    if (isPaused) {
      return;
    }

    const startTime = performance.now();
    const initialRemaining = remainingTimeRef.current;

    const updateProgress = () => {
      const elapsed = performance.now() - startTime;
      const remaining = Math.max(0, initialRemaining - elapsed);
      remainingTimeRef.current = remaining;
      const progressPercent = (remaining / TOAST_DURATION) * 100;
      setProgress(progressPercent);

      if (remaining <= 0) {
        onDismiss(data.id);
      }
    };

    const intervalId = setInterval(updateProgress, 50);
    return () => clearInterval(intervalId);
  }, [isPaused, data.id, onDismiss]);

  const handleMouseEnter = () => setIsPaused(true);
  const handleMouseLeave = () => setIsPaused(false);

  return (
    <motion.div
      layout
      initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, x: 50, scale: 0.95 }}
      animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, x: 0, scale: 1 }}
      exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, x: 30, scale: 0.95 }}
      transition={
        prefersReducedMotion ? { duration: 0.1 } : { type: "spring", stiffness: 400, damping: 30 }
      }
      className={cn(
        "pointer-events-auto relative overflow-hidden flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg",
        "bg-surface-1 border border-border/50 cursor-pointer select-none",
        "hover:shadow-xl transition-shadow duration-150",
        STYLES[data.type]
      )}
      onClick={() => onDismiss(data.id)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      role="alert"
    >
      {/* Icon */}
      <div
        className={cn(
          "shrink-0",
          data.type === "success" && "text-success",
          data.type === "error" && "text-error",
          data.type === "warning" && "text-warning",
          data.type === "info" && "text-info"
        )}
      >
        {ICONS[data.type]}
      </div>

      {/* Message */}
      <span className="text-sm font-medium text-foreground flex-1">{data.message}</span>

      {/* Close hint on hover */}
      <motion.span
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: isPaused ? 0.6 : 0, scale: isPaused ? 1 : 0.8 }}
        className="text-xs text-muted-foreground"
      >
        <X className="h-3 w-3" />
      </motion.span>

      {/* Progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-border/30">
        <motion.div
          className={cn("h-full", PROGRESS_COLORS[data.type])}
          initial={{ width: "100%" }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.05, ease: "linear" }}
        />
      </div>
    </motion.div>
  );
}

function generateToastId(): string {
  return `toast-${Date.now().toString()}-${Math.random().toString(36).slice(2, 6)}`;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastData[]>([]);
  const prefersReducedMotion = useReducedMotion();

  const toast = React.useCallback((message: string, type: ToastType = "success") => {
    const id = generateToastId();
    setToasts((prev) => [...prev, { id, message, type, createdAt: Date.now() }]);
  }, []);

  const dismiss = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Register global toast for use outside React components
  React.useEffect(() => {
    registerGlobalToast(toast);
    return () => unregisterGlobalToast();
  }, [toast]);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast container */}
      <div className="fixed bottom-4 right-4 z-toast flex flex-col gap-2 pointer-events-none">
        <AnimatePresence mode="popLayout">
          {toasts.map((t) => (
            <ToastItem
              key={t.id}
              data={t}
              onDismiss={dismiss}
              prefersReducedMotion={prefersReducedMotion}
            />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
