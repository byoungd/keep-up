"use client";

import { useReducedMotion } from "@/lib/animations/useReducedMotion";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

import type { IssueDefinition, IssueSeverity } from "@/lib/issues/issues";

const ISSUE_TONE = {
  info: "bg-accent-indigo/15 text-accent-indigo hover:bg-accent-indigo/25",
  warn: "bg-accent-amber/15 text-accent-amber hover:bg-accent-amber/25",
  blocking: "bg-destructive/15 text-destructive hover:bg-destructive/25",
} satisfies Record<IssueSeverity, string>;

export function IssueBadge({ issue }: { issue: IssueDefinition | null }) {
  const prefersReducedMotion = useReducedMotion();

  if (!issue) {
    return null;
  }
  const tone = ISSUE_TONE[issue.severity] ?? "bg-muted text-muted-foreground";

  if (prefersReducedMotion) {
    return (
      <span
        className={cn(
          "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
          "transition-colors duration-150 cursor-default",
          tone
        )}
      >
        {issue.label}
      </span>
    );
  }

  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        "transition-colors duration-150 cursor-default",
        tone
      )}
    >
      {issue.label}
    </motion.span>
  );
}
