"use client";

import { DocumentList } from "@/components/documents/DocumentList";
import { PendingImportList } from "@/components/documents/PendingImportList";
import { AIPanel } from "@/components/layout/AIPanel";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { useImportContextOptional } from "@/context/ImportContext";
import { useAIPanelState } from "@/context/PanelStateContext";
import { useDocuments } from "@/hooks/useDocuments";
import { useImportJobs } from "@/hooks/useImportManager";
import { cn } from "@/lib/utils";
import { Download, Library as LibraryIcon, Loader2 } from "lucide-react";

/**
 * Library Page - All content archive
 * Query: deleted_at IS NULL (supports filters by source/collection/tags)
 */
export default function LibraryPage() {
  const importContext = useImportContextOptional();
  const { setVisible: setShowAI } = useAIPanelState();

  const { documents, loading, error } = useDocuments({
    limit: 50,
    orderBy: "updatedAt",
    order: "desc",
  });
  const { jobs: importJobs } = useImportJobs({ limit: 10 });
  const pendingJobs = importJobs.filter(
    (job) => job.status !== "done" && job.status !== "canceled"
  );
  const hasPending = pendingJobs.length > 0;
  const isEmpty = !loading && documents.length === 0 && !hasPending;

  return (
    <AppShell rightPanel={<AIPanel onClose={() => setShowAI(false)} />}>
      <main className="flex-1 flex flex-col min-w-0 h-full bg-background">
        {/* Header - Linear-style: minimal chrome, content-focused */}
        <header
          className={cn(
            "flex items-center justify-between",
            "px-6 h-12 shrink-0",
            "border-b border-border/30"
          )}
        >
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex items-center justify-center",
                "w-7 h-7 rounded-lg",
                "bg-surface-2/80",
                "transition-transform duration-150 ease-out",
                "group-hover:scale-105"
              )}
            >
              <LibraryIcon className="h-4 w-4 text-foreground/60" />
            </div>
            <div className="flex items-baseline gap-2">
              <h1 className="text-[15px] font-semibold text-foreground tracking-[-0.01em]">
                Library
              </h1>
              {documents.length > 0 && (
                <span className="text-[11px] text-muted-foreground/70 tabular-nums font-medium">
                  {documents.length}
                </span>
              )}
            </div>
          </div>
          {documents.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => importContext?.openImportModal()}
              className={cn(
                "h-7 px-2.5 gap-1.5",
                "text-muted-foreground/80 hover:text-foreground",
                "hover:bg-surface-2/60",
                "transition-all duration-150"
              )}
            >
              <Download className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">Import</span>
            </Button>
          )}
        </header>

        {/* Content */}
        {loading && !hasPending && documents.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/50" />
              <span className="text-[13px] text-muted-foreground/60">Loading documents...</span>
            </div>
          </div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center space-y-2 max-w-xs">
              <p className="text-[13px] font-medium text-foreground/90">Unable to load documents</p>
              <p className="text-[12px] text-muted-foreground/60 leading-relaxed">
                {error.message}
              </p>
            </div>
          </div>
        ) : isEmpty ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center max-w-xs space-y-6">
              {/* Icon - Linear style: subtle gradient background */}
              <div
                className={cn(
                  "mx-auto w-16 h-16 rounded-2xl",
                  "bg-linear-to-b from-surface-2/80 to-surface-2/40",
                  "flex items-center justify-center",
                  "ring-1 ring-border/10"
                )}
              >
                <LibraryIcon className="h-7 w-7 text-muted-foreground/50" />
              </div>

              {/* Text - Linear style: clear hierarchy */}
              <div className="space-y-2">
                <h2 className="text-base font-semibold text-foreground tracking-[-0.01em]">
                  No documents yet
                </h2>
                <p className="text-[13px] text-muted-foreground/70 leading-relaxed">
                  Import articles, notes, or documents to build your reading library.
                </p>
              </div>

              {/* CTA - Linear style: prominent but not aggressive */}
              <Button
                variant="primary"
                onClick={() => importContext?.openImportModal()}
                className={cn(
                  "h-9 px-4 gap-2",
                  "text-[13px] font-medium",
                  "shadow-sm hover:shadow",
                  "transition-all duration-150"
                )}
              >
                <Download className="h-4 w-4" />
                Import your first document
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <div className="px-6 py-3 space-y-3">
              {hasPending && <PendingImportList jobs={pendingJobs} />}
              {documents.length > 0 && <DocumentList documents={documents} />}
            </div>
          </div>
        )}
      </main>
    </AppShell>
  );
}
