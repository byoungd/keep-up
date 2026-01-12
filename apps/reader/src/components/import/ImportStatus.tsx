"use client";

import { useRouter } from "@/i18n/navigation";
import { buildReaderPath } from "@/i18n/paths";
import { useReducedMotion } from "@/lib/animations/useReducedMotion";
import { formatImportSourceLabel } from "@/lib/import/importLabel";
import { cn } from "@/lib/utils";
import type { ImportJobRow } from "@keepup/db";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  CheckCircle2,
  ChevronUp,
  ExternalLink,
  Loader2,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useImportJobs, useImportManager } from "../../hooks/useImportManager";

/** How long to show completed jobs before auto-hiding (ms) */
const COMPLETED_JOB_DISPLAY_DURATION = 5000;

/** Spring animation config - Linear-style snappy feel */
const SPRING_CONFIG = { type: "spring", stiffness: 500, damping: 35 } as const;

export function ImportStatus() {
  const { jobs, loading } = useImportJobs({ limit: 10 });
  const manager = useImportManager();
  const t = useTranslations("Import");
  const router = useRouter();
  const locale = useLocale();
  const prefersReducedMotion = useReducedMotion();
  const [isVisible, setIsVisible] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);

  // Force re-render periodically to update time-based filtering
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isVisible && !isMinimized) {
        e.preventDefault();
        setIsMinimized(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isVisible, isMinimized]);

  const handleOpenDocument = useCallback(
    (docId: string) => {
      router.push(buildReaderPath(docId, locale));
    },
    [locale, router]
  );

  const visibleJobs = useMemo(() => {
    const now = Date.now();
    return jobs.filter((job) => {
      if (job.status !== "done") {
        return true;
      }
      return now - job.updatedAt < COMPLETED_JOB_DISPLAY_DURATION;
    });
  }, [jobs]);

  const handleClose = useCallback(() => {
    setIsVisible(false);
  }, []);

  const handleClearCompleted = useCallback(async () => {
    if (!manager) {
      return;
    }
    await manager.cleanupOldJobs(60 * 1000);
    const activeJobs = jobs.filter(
      (job) =>
        job.status === "queued" ||
        job.status === "ingesting" ||
        job.status === "normalizing" ||
        job.status === "storing"
    );
    if (activeJobs.length === 0) {
      setIsVisible(false);
    }
  }, [manager, jobs]);

  const handleToggleMinimize = useCallback(() => {
    setIsMinimized((prev) => !prev);
  }, []);

  useEffect(() => {
    if (visibleJobs.length > 0 && !isVisible) {
      setIsVisible(true);
      setIsMinimized(false);
    }
  }, [visibleJobs.length, isVisible]);

  if (!isVisible || (loading && visibleJobs.length === 0) || visibleJobs.length === 0) {
    return null;
  }

  const sortedJobs = [...visibleJobs].sort((a, b) => b.updatedAt - a.updatedAt);

  const activeCount = sortedJobs.filter(
    (job) =>
      job.status === "queued" ||
      job.status === "ingesting" ||
      job.status === "normalizing" ||
      job.status === "storing"
  ).length;

  const completedCount = sortedJobs.filter(
    (job) => job.status === "done" || job.status === "failed" || job.status === "canceled"
  ).length;

  return (
    <motion.div
      initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.95 }}
      animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
      exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98 }}
      transition={prefersReducedMotion ? { duration: 0.1 } : SPRING_CONFIG}
      className={cn(
        "fixed bottom-4 right-4 z-50 w-80",
        "bg-surface-1 backdrop-blur-xl",
        "border border-border/60 rounded-xl",
        "shadow-lg shadow-black/5",
        "overflow-hidden"
      )}
    >
      {/* Header - Compact, Linear-style */}
      <div
        className={cn(
          "px-3 py-2 flex justify-between items-center",
          "bg-surface-2/50 border-b border-border/40",
          "select-none"
        )}
      >
        <button
          type="button"
          onClick={handleToggleMinimize}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          aria-label={isMinimized ? t("expand") : t("minimize")}
        >
          <motion.div animate={{ rotate: isMinimized ? 0 : 180 }} transition={{ duration: 0.2 }}>
            <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
          </motion.div>
          <span className="text-[13px] font-medium text-foreground">{t("queueTitle")}</span>
          {activeCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 text-[10px] font-medium bg-accent-indigo text-white rounded-full">
              {activeCount}
            </span>
          )}
        </button>

        <div className="flex items-center gap-0.5">
          {/* Clear completed - only show when there are completed jobs */}
          <AnimatePresence>
            {completedCount > 0 && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.15 }}
                type="button"
                onClick={handleClearCompleted}
                className={cn(
                  "p-1.5 rounded-md",
                  "text-muted-foreground hover:text-foreground",
                  "hover:bg-surface-3/60 active:bg-surface-3",
                  "transition-colors duration-100"
                )}
                aria-label={t("clearCompleted")}
                title={t("clearCompleted")}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </motion.button>
            )}
          </AnimatePresence>

          {/* Close button */}
          <button
            type="button"
            onClick={handleClose}
            className={cn(
              "p-1.5 rounded-md",
              "text-muted-foreground hover:text-foreground",
              "hover:bg-surface-3/60 active:bg-surface-3",
              "transition-colors duration-100"
            )}
            aria-label={t("close")}
            title={t("close")}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Job list - Animated expand/collapse */}
      <AnimatePresence initial={false}>
        {!isMinimized && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={
              prefersReducedMotion ? { duration: 0.1 } : { duration: 0.2, ease: [0.4, 0, 0.2, 1] }
            }
            className="overflow-hidden"
          >
            <div className="max-h-64 overflow-y-auto">
              <div className="p-1.5 space-y-0.5">
                <AnimatePresence mode="popLayout" initial={false}>
                  {sortedJobs.map((job) => (
                    <JobItem
                      key={job.jobId}
                      job={job}
                      manager={manager}
                      t={t}
                      onOpenDocument={handleOpenDocument}
                      prefersReducedMotion={prefersReducedMotion}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Job Item Component - Split into sub-components to reduce complexity
// ─────────────────────────────────────────────────────────────────────────────

interface JobItemProps {
  job: ImportJobRow;
  manager: import("@keepup/db").ImportManager | import("@keepup/db").ProxyImportManager | null;
  t: (key: string) => string;
  onOpenDocument: (docId: string) => void;
  prefersReducedMotion: boolean;
}

/** Action buttons for job items */
function JobActions({
  jobState,
  isHovered,
  onRetry,
  onCancel,
  onDelete,
  t,
}: {
  jobState: ReturnType<typeof getJobState>;
  isHovered: boolean;
  onRetry: (e: React.MouseEvent) => void;
  onCancel: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  t: (key: string) => string;
}) {
  const buttonClass = cn(
    "p-1 rounded-md",
    "text-muted-foreground hover:text-foreground",
    "hover:bg-surface-3/80 active:bg-surface-3",
    "transition-colors duration-100"
  );

  const deleteClass = cn(
    "p-1 rounded-md",
    "text-muted-foreground hover:text-error",
    "hover:bg-error/10 active:bg-error/20",
    "transition-colors duration-100"
  );

  return (
    <div className="flex items-center gap-0.5 shrink-0">
      {jobState.isFailed && (
        <button
          type="button"
          onClick={onRetry}
          className={buttonClass}
          title={t("retry")}
          aria-label={t("retry")}
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      )}
      {jobState.isPending && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: isHovered ? 1 : 0.4 }}
          type="button"
          onClick={onCancel}
          className={deleteClass}
          title={t("cancel")}
          aria-label={t("cancel")}
        >
          <X className="w-3.5 h-3.5" />
        </motion.button>
      )}
      {!jobState.isPending && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: isHovered ? 1 : 0.3 }}
          type="button"
          onClick={onDelete}
          className={deleteClass}
          title={t("delete")}
          aria-label={t("delete")}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </motion.button>
      )}
    </div>
  );
}

/** Progress bar for pending jobs */
function JobProgressBar({
  isPending,
  progress,
  prefersReducedMotion,
}: {
  isPending: boolean;
  progress: number;
  prefersReducedMotion: boolean;
}) {
  if (!isPending) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scaleY: 0 }}
        animate={{ opacity: 1, scaleY: 1 }}
        exit={{ opacity: 0, scaleY: 0 }}
        transition={{ duration: prefersReducedMotion ? 0.05 : 0.15 }}
        className="h-1 w-full bg-surface-3/60 rounded-full overflow-hidden origin-top"
      >
        <motion.div
          className="h-full bg-gradient-to-r from-accent-indigo to-accent-violet rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        />
      </motion.div>
    </AnimatePresence>
  );
}

/** Error message display */
function JobErrorMessage({
  hasError,
  message,
  t,
}: { hasError: boolean; message?: string; t: (key: string) => string }) {
  if (!hasError) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: "auto" }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: 0.15 }}
        className="flex items-start gap-1.5 text-[11px] text-error bg-error/8 px-2 py-1.5 rounded-md overflow-hidden"
      >
        <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
        <span className="break-words">{message || t("unknownError")}</span>
      </motion.div>
    </AnimatePresence>
  );
}

function JobItem({ job, manager, t, onOpenDocument, prefersReducedMotion }: JobItemProps) {
  const jobState = getJobState(job);
  const overallProgress = getOverallProgress(job);
  const [isHovered, setIsHovered] = useState(false);

  const handleRetry = (e: React.MouseEvent) => {
    e.stopPropagation();
    manager?.retryJob(job.jobId);
  };

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    manager?.cancelJob(job.jobId);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    manager?.deleteJob(job.jobId);
  };

  const handleClick = () => {
    if (jobState.isDone && job.resultDocumentId) {
      onOpenDocument(job.resultDocumentId);
    }
  };

  const isClickable = jobState.isDone && Boolean(job.resultDocumentId);

  const handleKeyDown = isClickable
    ? (e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }
    : undefined;

  return (
    <motion.div
      layout
      initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, x: 20 }}
      animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, x: 0 }}
      exit={
        prefersReducedMotion
          ? { opacity: 0 }
          : { opacity: 0, x: -10, transition: { duration: 0.15 } }
      }
      transition={prefersReducedMotion ? { duration: 0.1 } : SPRING_CONFIG}
      className={cn(
        "group relative flex flex-col gap-1.5 px-2.5 py-2 rounded-lg",
        "transition-colors duration-100",
        isClickable && "cursor-pointer",
        isHovered ? "bg-surface-2/80" : "hover:bg-surface-2/50"
      )}
      onClick={isClickable ? handleClick : undefined}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onKeyDown={handleKeyDown}
      tabIndex={isClickable ? 0 : undefined}
      role={isClickable ? "button" : undefined}
    >
      {/* Main row */}
      <div className="flex items-center gap-2.5">
        <JobStatusIcon jobState={jobState} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="text-[13px] font-medium text-foreground truncate"
              title={job.sourceRef}
            >
              {formatImportSourceLabel(job.sourceRef)}
            </span>
            {isClickable && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: isHovered ? 1 : 0 }}
                className="shrink-0"
              >
                <ExternalLink className="w-3 h-3 text-muted-foreground" />
              </motion.span>
            )}
          </div>
          <span className="text-[11px] text-muted-foreground">
            {getStatusLabel(job.status, t)}
            {jobState.isPending && overallProgress > 0 && (
              <span className="text-foreground/60"> · {Math.round(overallProgress)}%</span>
            )}
          </span>
        </div>

        <JobActions
          jobState={jobState}
          isHovered={isHovered}
          onRetry={handleRetry}
          onCancel={handleCancel}
          onDelete={handleDelete}
          t={t}
        />
      </div>

      <JobProgressBar
        isPending={jobState.isPending}
        progress={overallProgress}
        prefersReducedMotion={prefersReducedMotion}
      />

      <JobErrorMessage hasError={jobState.hasError} message={job.errorMessage ?? undefined} t={t} />
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Components
// ─────────────────────────────────────────────────────────────────────────────

function JobStatusIcon({ jobState }: { jobState: ReturnType<typeof getJobState> }) {
  const baseClasses = "w-4 h-4 shrink-0";

  if (jobState.isPending) {
    return (
      <div className="relative">
        <Loader2 className={cn(baseClasses, "text-accent-indigo animate-spin")} />
      </div>
    );
  }
  if (jobState.isDone) {
    return (
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 25 }}
      >
        <CheckCircle2 className={cn(baseClasses, "text-success")} />
      </motion.div>
    );
  }
  if (jobState.isFailed) {
    return <AlertCircle className={cn(baseClasses, "text-error")} />;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────────────────────

function getJobState(job: ImportJobRow) {
  const isPending =
    job.status === "queued" ||
    job.status === "ingesting" ||
    job.status === "normalizing" ||
    job.status === "storing";
  const isDone = job.status === "done";
  const isFailed = job.status === "failed";
  const hasError = job.errorCode !== null && job.errorCode !== "";

  return { isPending, isDone, isFailed, hasError };
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

function getStatusLabel(status: string, t: (key: string) => string): string {
  const statusMap: Record<string, string> = {
    queued: t("statusQueued"),
    ingesting: t("statusIngesting"),
    normalizing: t("statusNormalizing"),
    storing: t("statusStoring"),
    done: t("statusDone"),
    failed: t("statusFailed"),
    canceled: t("statusCanceled"),
  };
  return statusMap[status] || status;
}
