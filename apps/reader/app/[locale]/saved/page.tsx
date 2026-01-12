"use client";

import { DocumentList } from "@/components/documents/DocumentList";
import { AIPanel } from "@/components/layout/AIPanel";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { useAIPanelState } from "@/context/PanelStateContext";
import { useSavedDocuments } from "@/hooks/useSavedDocuments";
import { Bookmark, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";

/**
 * Saved Page - Read-later / Starred items
 * Query: saved_at IS NOT NULL AND deleted_at IS NULL
 */
export default function SavedPage() {
  const t = useTranslations("SavedPage");
  const { setVisible: setShowAI } = useAIPanelState();
  const { documents, loading, refresh } = useSavedDocuments();

  const isEmpty = documents.length === 0;

  return (
    <AppShell rightPanel={<AIPanel onClose={() => setShowAI(false)} />}>
      <main className="flex-1 flex flex-col min-w-0 h-full">
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <Bookmark className="h-5 w-5 text-primary" aria-hidden="true" />
            <h1 className="text-lg font-semibold">{t("title")}</h1>
          </div>
        </header>

        {/* Content */}
        {loading ? (
          <div
            className="flex-1 flex items-center justify-center"
            aria-busy="true"
            aria-live="polite"
          >
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">{t("loading")}</span>
          </div>
        ) : isEmpty ? (
          <div className="flex-1 flex items-center justify-center">
            <article className="text-center max-w-sm space-y-4">
              <div className="mx-auto w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center">
                <Bookmark className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
              </div>
              <h2 className="text-lg font-medium">{t("emptyTitle")}</h2>
              <p className="text-sm text-muted-foreground">{t("emptyDescription")}</p>
              <div className="flex items-center justify-center gap-3 pt-2">
                <Button variant="outline" asChild>
                  <Link href="/unread">{t("goToUnread")}</Link>
                </Button>
              </div>
            </article>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-6 py-4" aria-live="polite">
            <DocumentList documents={documents} onRefresh={refresh} />
          </div>
        )}
      </main>
    </AppShell>
  );
}
