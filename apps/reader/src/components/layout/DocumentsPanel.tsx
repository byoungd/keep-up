"use client";

import { AnnotationManager } from "@/components/annotations/AnnotationManager";
import { ImportDialog } from "@/components/import/ImportDialog";
import { ImportStatus } from "@/components/import/ImportStatus";
import { RSSFeedDialog } from "@/components/import/RSSFeedDialog";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { useDocuments } from "@/hooks/useDocuments";
import { useRouter } from "@/i18n/navigation";
import { buildReaderPath } from "@/i18n/paths";
import { importFeatureFlags } from "@/lib/import/importFeatures";
import { cn } from "@ku0/shared/utils";
import { ChevronRight, Download, FileText, Filter, Loader2, Plus, Rss } from "lucide-react";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import * as React from "react";

/** Format timestamp to localized date string */
function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export const DocumentsPanel = React.memo(function DocumentsPanel() {
  const [activeFolderOpen, setActiveFolderOpen] = React.useState(true);
  const [importDialogOpen, setImportDialogOpen] = React.useState(false);
  const [rssDialogOpen, setRssDialogOpen] = React.useState(false);
  const t = useTranslations("DocumentsPanel");
  const { toast } = useToast();
  const router = useRouter();
  const locale = useLocale();
  const searchParams = useSearchParams();
  const currentDocId = searchParams.get("doc");
  const rssImportEnabled = importFeatureFlags.rss;

  // Fetch real documents from database
  const { documents, loading } = useDocuments({ limit: 50, orderBy: "updatedAt", order: "desc" });

  const handleRssImportSuccess = React.useCallback(
    (count: number) => {
      toast(`Imported ${count} RSS articles`, "success");
    },
    [toast]
  );

  const handleDocumentClick = React.useCallback(
    (docId: string) => {
      router.push(buildReaderPath(docId, locale));
    },
    [locale, router]
  );

  return (
    <div className="documents-panel flex flex-col h-full bg-surface-1/50">
      {/* Import Dialogs */}
      <ImportDialog open={importDialogOpen} onOpenChange={setImportDialogOpen} />
      <ImportStatus />
      {rssImportEnabled && (
        <RSSFeedDialog
          open={rssDialogOpen}
          onOpenChange={setRssDialogOpen}
          onImportSuccess={handleRssImportSuccess}
        />
      )}

      {/* Header Section */}
      <div className="px-5 py-4 shrink-0 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground tracking-tight">{t("title")}</h2>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              aria-label={t("filter")}
            >
              <Filter className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={() => setImportDialogOpen(true)}
              aria-label={t("importDocument")}
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
            {rssImportEnabled && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={() => setRssDialogOpen(true)}
                aria-label={t("importRssFeed")}
              >
                <Rss className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              aria-label={t("addDocument")}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <Input
          variant="search"
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
        />
      </div>

      {/* Scrollable Content */}
      <section
        className="flex-1 overflow-auto px-3 py-2 space-y-6 scrollbar-thin scrollbar-thumb-transparent hover:scrollbar-thumb-border/50 scrollbar-track-transparent"
        aria-label={t("allDocuments")}
        /* biome-ignore lint/a11y/noNoninteractiveTabindex: scrollable region */
        tabIndex={0}
      >
        {/* Section: Active Workspace */}
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => setActiveFolderOpen(!activeFolderOpen)}
            className="flex items-center gap-2 w-full px-2 py-1.5 text-[11px] font-bold text-muted-foreground/80 hover:text-foreground transition-colors group uppercase tracking-wider rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <span
              className={cn("transition-transform duration-200", activeFolderOpen && "rotate-90")}
            >
              <ChevronRight className="h-3 w-3" />
            </span>
            <span>{t("activeWorkspace")}</span>
            <Badge
              variant="secondary"
              className="ml-auto text-[10px] h-4 min-w-5 px-1 shadow-none bg-surface-2 text-muted-foreground group-hover:bg-surface-3 group-hover:text-foreground transition-colors"
            >
              {documents.length}
            </Badge>
          </button>

          {activeFolderOpen && (
            <div className="space-y-1 mt-1 pl-1 animate-in slide-in-from-top-1 duration-200 fade-in-0">
              {loading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : documents.length === 0 ? (
                <div className="text-center py-4 text-sm text-muted-foreground">
                  {t("noDocuments")}
                </div>
              ) : (
                documents.map((doc) => (
                  <DocumentCard
                    key={doc.docId}
                    docId={doc.docId}
                    title={doc.title || t("untitled")}
                    date={formatDate(doc.updatedAt)}
                    active={doc.docId === currentDocId}
                    onClick={handleDocumentClick}
                  />
                ))
              )}
            </div>
          )}
        </div>

        {/* Section: Archived (Collapsed) */}
        <div className="space-y-1">
          <button
            type="button"
            className="flex items-center gap-2 w-full px-2 py-1.5 text-[11px] font-bold text-muted-foreground/80 hover:text-foreground transition-colors group uppercase tracking-wider rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <ChevronRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
            <span>{t("archived")}</span>
          </button>
        </div>

        {/* Section: Shared (Collapsed) */}
        <div className="space-y-1">
          <button
            type="button"
            className="flex items-center gap-2 w-full px-2 py-1.5 text-[11px] font-bold text-muted-foreground/80 hover:text-foreground transition-colors group uppercase tracking-wider rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <ChevronRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
            <span>{t("allDocuments")}</span>
            <Badge
              variant="secondary"
              className="ml-auto text-[10px] h-4 min-w-5 px-1 shadow-none bg-surface-2 text-muted-foreground group-hover:bg-surface-3 group-hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
            >
              8
            </Badge>
          </button>
        </div>
      </section>

      {/* Footer Area */}
      <div className="p-4 border-t border-border/40 bg-surface-1/50 backdrop-blur-md">
        <AnnotationManager />
      </div>
    </div>
  );
});

const DocumentCard = React.memo(function DocumentCard({
  docId,
  title,
  date,
  active,
  onClick,
}: {
  docId: string;
  title: string;
  date: string;
  active?: boolean;
  onClick: (docId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(docId)}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative w-full px-3 py-2.5 rounded-lg border transition-all duration-200 cursor-pointer select-none mx-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        active
          ? "bg-background border-border/60 shadow-sm ring-1 ring-black/5 dark:ring-white/5"
          : "bg-transparent border-transparent hover:bg-surface-2 hover:border-border/30 hover:shadow-xs"
      )}
    >
      {/* Active Indicator Line */}
      {active && (
        <div className="absolute left-0 top-2.5 bottom-2.5 w-[3px] bg-primary rounded-r-full shadow-[0_0_8px_var(--color-accent-indigo-glow)]" />
      )}

      <div className="flex flex-col gap-1.5 pl-1">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <FileText
              className={cn(
                "h-3.5 w-3.5 shrink-0 transition-colors",
                active ? "text-primary" : "text-muted-foreground group-hover:text-foreground/70"
              )}
            />
            <span
              className={cn(
                "text-[13px] font-medium truncate leading-none transition-colors",
                active ? "text-foreground" : "text-foreground/80 group-hover:text-foreground"
              )}
            >
              {title}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between text-[10px] text-muted-foreground pl-[22px]">
          <span className="group-hover:text-muted-foreground/80 transition-colors">{date}</span>
        </div>
      </div>
    </button>
  );
});
