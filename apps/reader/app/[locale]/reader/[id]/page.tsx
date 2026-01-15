"use client";

import { CollabStatusBanner, PresenceIndicator } from "@/components/collab";
import { AIPanel } from "@/components/layout/AIPanel";
import { ReaderShellLayout } from "@/components/layout/ReaderShellLayout";
import { ArticleRenderer } from "@/components/reader/ArticleRenderer";
import { ReaderPageSkeleton } from "@/components/ui/skeletons";
import { useAIPanelState } from "@/context/PanelStateContext";
import { type CollabSessionResult, useCollabSession } from "@/hooks/useCollabSession";
import { useDocumentContent } from "@/hooks/useDocumentContent";
import { cn } from "@/lib/utils";
import { FileQuestion, RefreshCw } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import ReactMarkdown from "react-markdown";

function resolveDocId(value: string | string[] | undefined): string | null {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/** Hook for auto-hiding scrollbar behavior */
function useAutoHideScrollbar() {
  const [isScrolling, setIsScrolling] = React.useState(false);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout>>(null);

  const handleScroll = React.useCallback(() => {
    setIsScrolling(true);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setIsScrolling(false);
    }, 1000);
  }, []);

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return { isScrolling, handleScroll };
}

/** Linear-style empty state component */
function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-sm animate-in fade-in duration-500 slide-in-from-bottom-4">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-surface-2 mb-4">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
        <h2 className="text-sm font-medium text-foreground mb-1">{title}</h2>
        <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground bg-surface-2 hover:bg-surface-3 rounded-lg transition-colors"
          >
            <RefreshCw className="h-3 w-3" />
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}

/** Document content view with presence header */
function DocumentContentView({
  title,
  content,
  collab,
  showCollabUI,
  isScrolling,
  handleScroll,
}: {
  title: string;
  content: string;
  collab: CollabSessionResult;
  showCollabUI: boolean;
  isScrolling: boolean;
  handleScroll: () => void;
}) {
  return (
    <div
      className={cn("flex-1 overflow-y-auto scrollbar-auto-hide", isScrolling && "is-scrolling")}
      onScroll={handleScroll}
    >
      {/* Presence indicator header (when collab enabled) */}
      {showCollabUI && collab.peers.length > 0 && (
        <div className="sticky top-0 z-10 flex items-center justify-end bg-background/80 backdrop-blur-sm px-6 py-2 border-b border-border/40">
          <PresenceIndicator peers={collab.peers} />
        </div>
      )}

      <ArticleRenderer title={title}>
        {content.trim().length > 0 ? (
          <ReactMarkdown>{content}</ReactMarkdown>
        ) : (
          <p className="text-muted-foreground italic">No content available.</p>
        )}
      </ArticleRenderer>
    </div>
  );
}

export default function ReaderPage() {
  const params = useParams<{ id?: string | string[] }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const docId = resolveDocId(params?.id);
  const { setVisible: setShowAI } = useAIPanelState();
  const { document, content, isLoading, error, notFound } = useDocumentContent(docId);
  const { isScrolling, handleScroll } = useAutoHideScrollbar();

  // Get display name from URL params (for testing) or use default
  const displayName = searchParams?.get("uid") ?? undefined;

  // Collaboration session (only active when collab_enabled=true)
  const collab = useCollabSession({
    docId: docId ?? "",
    displayName,
  });

  const showCollabUI = collab.state !== "disabled";

  return (
    <ReaderShellLayout
      docId={docId ?? undefined}
      rightPanel={<AIPanel onClose={() => setShowAI(false)} />}
    >
      <main className="flex-1 flex flex-col min-w-0 h-full reader-surface">
        {/* Collaboration status banner (shown when not connected and collab enabled) */}
        {showCollabUI && collab.state !== "connected" && (
          <CollabStatusBanner
            state={collab.state}
            error={collab.error}
            pendingUpdates={collab.pendingUpdates}
            onRetry={collab.retry}
            className="mx-4 mt-4"
          />
        )}

        {isLoading && <ReaderPageSkeleton />}

        {!isLoading && error && (
          <EmptyState
            icon={RefreshCw}
            title="Unable to load document"
            description={error.message || "Something went wrong while loading this document."}
            action={{ label: "Try again", onClick: () => router.refresh() }}
          />
        )}

        {!isLoading && !error && notFound && (
          <EmptyState
            icon={FileQuestion}
            title="Document not found"
            description="This document might have been deleted or failed to import."
            action={{ label: "Go back", onClick: () => router.back() }}
          />
        )}

        {!isLoading && !error && !notFound && (
          <DocumentContentView
            title={document?.title ?? "Untitled"}
            content={content}
            collab={collab}
            showCollabUI={showCollabUI}
            isScrolling={isScrolling}
            handleScroll={handleScroll}
          />
        )}
      </main>
    </ReaderShellLayout>
  );
}
