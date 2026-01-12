"use client";

import { cn } from "@keepup/shared/utils";
import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface ErrorPrimitiveProps {
  statusCode?: string;
  title: string;
  description: string;
  actions?: ReactNode;
  className?: string;
}

/**
 * A shared primitive component for error and not-found pages.
 * Designed with a premium Linear-style aesthetic.
 */
export function ErrorPrimitive({
  statusCode,
  title,
  description,
  actions,
  className,
}: ErrorPrimitiveProps) {
  return (
    <div
      className={cn(
        "min-h-screen w-full flex flex-col items-center justify-center p-4 relative overflow-hidden bg-background",
        className
      )}
    >
      {/* Ambient backgrounds */}
      <div className="absolute inset-0 select-none pointer-events-none overflow-hidden">
        {/* Main gradient glow */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 0.5, scale: 1 }}
          transition={{ duration: 1.5, ease: "easeOut" }}
          className="absolute top-[15%] left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-gradient-radial from-primary/10 via-primary/5 to-transparent rounded-full blur-[120px] mix-blend-plus-lighter"
        />

        {/* Subtle accent glow */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.3 }}
          transition={{ duration: 2, delay: 0.5 }}
          className="absolute -top-[10%] -right-[10%] w-[500px] h-[500px] bg-primary/5 rounded-full blur-[100px]"
        />

        {/* Minimal Grid Pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:14px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
      </div>

      <div className="relative z-10 text-center max-w-xl space-y-12">
        <div className="space-y-4">
          {statusCode && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            >
              <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary ring-1 ring-inset ring-primary/20">
                {statusCode} Error
              </span>
            </motion.div>
          )}

          <div className="space-y-4">
            {statusCode && (
              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
                className="text-8xl sm:text-9xl font-serif font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-foreground to-foreground/40 leading-none select-none"
              >
                {statusCode}
              </motion.h1>
            )}

            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className={cn(
                "text-3xl sm:text-4xl font-serif font-medium text-foreground tracking-tight",
                !statusCode && "text-5xl sm:text-6xl"
              )}
            >
              {title}
            </motion.h2>
          </div>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="text-lg text-muted-foreground leading-relaxed max-w-[45ch] mx-auto"
          >
            {description}
          </motion.p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          {actions}
        </motion.div>
      </div>

      {/* Subtle bottom detail */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.4 }}
        transition={{ delay: 1, duration: 1 }}
        className="absolute bottom-12 text-[10px] tracking-[0.2em] uppercase text-muted-foreground/50 font-mono"
      >
        Keep Up / System Intelligence
      </motion.div>
    </div>
  );
}
