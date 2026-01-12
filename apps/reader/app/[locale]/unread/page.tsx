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
import { Download, Inbox, Loader2, Rss } from "lucide-react";
import Link from "next/link";

/**
 * Unread Page - Default landing
 * Shows all unread content (RSS items, imported docs, etc.)
 * Query: read_at IS NULL AND deleted_at IS NULL
 */
export default function UnreadPage() {
  const importContext = useImportContextOptional();
  const { setVisible: setShowAI } = useAIPanelState();

  const { documents, loading, error, refresh } = useDocuments({
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
      <main className="flex-1 flex flex-col min-w-0 h-full">
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <Inbox className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">Unread</h1>
          </div>
        </header>

        {/* Content */}
        {loading && !hasPending && documents.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-2">
              <p className="text-sm font-medium text-foreground">Unable to load documents.</p>
              <p className="text-xs text-muted-foreground">{error.message}</p>
            </div>
          </div>
        ) : isEmpty ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-sm space-y-4">
              <div className="mx-auto w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center">
                <Inbox className="h-6 w-6 text-muted-foreground" />
              </div>
              <h2 className="text-lg font-medium">All caught up</h2>
              <p className="text-sm text-muted-foreground">
                Import content or subscribe to feeds to get started.
              </p>
              <div className="flex items-center justify-center gap-3 pt-2">
                <Button
                  variant="primary"
                  onClick={() => importContext?.openImportModal()}
                  className="gap-2"
                >
                  <Download className="h-4 w-4" />
                  Import content
                </Button>
                <Button variant="outline" asChild className="gap-2">
                  <Link href="/feeds">
                    <Rss className="h-4 w-4" />
                    Add a feed
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
            {hasPending && <PendingImportList jobs={pendingJobs} />}
            {documents.length > 0 && <DocumentList documents={documents} onRefresh={refresh} />}
          </div>
        )}
      </main>
    </AppShell>
  );
}
