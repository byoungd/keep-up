"use client";

import { useImportManager } from "@/hooks/useImportManager";
import { formatImportSourceLabel } from "@/lib/import/importLabel";
import { cn } from "@/lib/utils";
import type { ImportJobRow } from "@ku0/db";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Loader2, RefreshCw, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

interface PendingImportListProps {
  jobs: ImportJobRow[];
}

/** Spring animation config - Linear-style snappy feel */
const SPRING_CONFIG = { type: "spring", stiffness: 500, damping: 35 } as const;

export function PendingImportList({ jobs }: PendingImportListProps) {
  const t = useTranslations("Import");
  const manager = useImportManager();

  if (jobs.length === 0) {
    return null;
  }

  return (
    <div className="space-y-1">
      <AnimatePresence mode="popLayout" initial={false}>
        {jobs.map((job) => (
          <PendingImportItem key={job.jobId} job={job} manager={manager} t={t} />
        ))}
      </AnimatePresence>
    </div>
  );
}

interface PendingImportItemProps {
  job: ImportJobRow;
  manager: ReturnType<typeof useImportManager>;
  t: (key: string) => string;
}

function PendingImportItem({ job, manager, t }: PendingImportItemProps) {
  const [isHovered, setIsHovered] = useState(false);
  const isFailed = job.status === "failed";
  const isCanceled = job.status === "canceled";
  const isTerminal = isFailed || isCanceled;
  const showSpinner =
    job.status === "queued" ||
    job.status === "ingesting" ||
    job.status === "normalizing" ||
    job.status === "storing";

  const progress = getOverallProgress(job);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10, transition: { duration: 0.15 } }}
      transition={SPRING_CONFIG}
      className={cn(
        "group relative flex flex-col gap-2",
        "px-3 py-2.5 -mx-1 rounded-lg",
        "transition-colors duration-100",
        isHovered ? "bg-surface-2/70" : "hover:bg-surface-2/50"
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Main row */}
      <div className="flex items-center gap-3">
        {/* Icon */}
        <div
          className={cn(
            "flex items-center justify-center",
            "w-8 h-8 rounded-lg",
            "transition-colors duration-100",
            isTerminal ? "bg-error/10" : "bg-surface-2/60 group-hover:bg-surface-3/60"
          )}
        >
          {showSpinner ? (
            <Loader2 className="h-4 w-4 animate-spin text-accent-indigo" />
          ) : (
            <AlertCircle className="h-4 w-4 text-error" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium text-foreground truncate">
              {formatImportSourceLabel(job.sourceRef)}
            </span>
          </div>
          <span className="text-[11px] text-muted-foreground">
            {renderStatusLabel(job.status, t)}
            {showSpinner && progress > 0 && (
              <span className="text-foreground/60"> · {Math.round(progress)}%</span>
            )}
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5 shrink-0">
          {isFailed && (
            <button
              type="button"
              className={cn(
                "p-1.5 rounded-md",
                "text-muted-foreground hover:text-foreground",
                "hover:bg-surface-3/80 active:bg-surface-3",
                "transition-colors duration-100"
              )}
              onClick={() => manager?.retryJob(job.jobId)}
              title={t("retry")}
              aria-label={t("retry")}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          )}
          {isTerminal && (
            <button
              type="button"
              className={cn(
                "p-1.5 rounded-md",
                "text-muted-foreground hover:text-error",
                "hover:bg-error/10 active:bg-error/20",
                "transition-colors duration-100"
              )}
              onClick={() => manager?.deleteJob(job.jobId)}
              title={t("delete")}
              aria-label={t("delete")}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          {showSpinner && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: isHovered ? 1 : 0.4 }}
              type="button"
              className={cn(
                "p-1.5 rounded-md",
                "text-muted-foreground hover:text-error",
                "hover:bg-error/10 active:bg-error/20",
                "transition-colors duration-100"
              )}
              onClick={() => manager?.cancelJob(job.jobId)}
              title={t("cancel")}
              aria-label={t("cancel")}
            >
              <X className="h-3.5 w-3.5" />
            </motion.button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <AnimatePresence>
        {showSpinner && (
          <motion.div
            initial={{ opacity: 0, scaleY: 0 }}
            animate={{ opacity: 1, scaleY: 1 }}
            exit={{ opacity: 0, scaleY: 0 }}
            transition={{ duration: 0.15 }}
            className="h-1 w-full bg-surface-3/60 rounded-full overflow-hidden origin-top"
          >
            <motion.div
              className="h-full bg-gradient-to-r from-accent-indigo to-accent-violet rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error message */}
      <AnimatePresence>
        {isFailed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="flex items-start gap-1.5 text-[11px] text-error bg-error/8 px-2 py-1.5 rounded-md overflow-hidden"
          >
            <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
            <span className="break-words">{job.errorMessage || t("unknownError")}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function getOverallProgress(job: ImportJobRow): number {
  switch (job.status) {
    case "queued":
      return 0;
    case "ingesting":
      return (job.progress ?? 0) * 0.7;
    case "normalizing":
      return 75;
    case "storing":
      return 92;
    case "done":
      return 100;
    default:
      return job.progress ?? 0;
  }
}

function renderStatusLabel(status: ImportJobRow["status"], t: (key: string) => string): string {
  const statusMap: Record<ImportJobRow["status"], string> = {
    queued: t("statusQueued"),
    ingesting: t("statusIngesting"),
    normalizing: t("statusNormalizing"),
    storing: t("statusStoring"),
    done: t("statusDone"),
    failed: t("statusFailed"),
    canceled: t("statusCanceled"),
  };
  return statusMap[status];
}
