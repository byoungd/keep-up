"use client";

/**
 * ComposerOverlay - Linear-style drop zone
 *
 * Design Philosophy:
 * - Subtle glass effect, not overpowering
 * - Clear affordance without visual noise
 * - Quick, responsive animations
 */

import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { Plus } from "lucide-react";

interface ComposerOverlayProps {
  isVisible: boolean;
}

export function ComposerOverlay({ isVisible }: ComposerOverlayProps) {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className={cn(
            "absolute inset-0 z-50",
            "flex items-center justify-center",
            "bg-background/60 backdrop-blur-sm",
            "rounded-lg border-2 border-dashed border-primary/30"
          )}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="flex flex-col items-center gap-3"
          >
            {/* Icon */}
            <div
              className={cn(
                "w-12 h-12 rounded-xl",
                "flex items-center justify-center",
                "bg-primary/10 text-primary"
              )}
            >
              <Plus className="w-6 h-6" aria-hidden="true" />
            </div>

            {/* Text */}
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">Drop to add</p>
              <p className="text-xs text-muted-foreground/60 mt-0.5">
                Files will be added to queue
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
