"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import { useDocumentActions } from "@/hooks/useDocumentActions";
import { useToggleSaved } from "@/hooks/useToggleSaved";
import { Link } from "@/i18n/navigation";
import { buildReaderPath } from "@/i18n/paths";
import { cn } from "@/lib/utils";
import type { DocumentRow } from "@ku0/db";
import {
  Bookmark,
  BookmarkCheck,
  ExternalLink,
  FileText,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { useToast } from "../ui/Toast";
import { DeleteDocumentDialog } from "./DeleteDocumentDialog";
import { RenameDocumentDialog } from "./RenameDocumentDialog";

interface DocumentListProps {
  documents: DocumentRow[];
  onRefresh?: () => void;
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) {
      const diffMins = Math.floor(diffMs / (1000 * 60));
      if (diffMins < 1) {
        return "Just now";
      }
      return `${diffMins}m ago`;
    }
    return `${diffHours}h ago`;
  }
  if (diffDays === 1) {
    return "Yesterday";
  }
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

export function DocumentList({ documents, onRefresh }: DocumentListProps) {
  const t = useTranslations("DocumentsPanel");
  const { toast } = useToast();
  const { deleteDocument, renameDocument } = useDocumentActions();
  const { toggleSaved } = useToggleSaved();
  const locale = useLocale();

  const [renameDoc, setRenameDoc] = useState<DocumentRow | null>(null);
  const [deleteDoc, setDeleteDoc] = useState<DocumentRow | null>(null);

  const handleRename = async (docId: string, newTitle: string) => {
    try {
      await renameDocument(docId, newTitle);
      toast(t("renameSuccess"), "success");
      setRenameDoc(null);
      onRefresh?.();
    } catch {
      toast("Failed to rename document", "error");
    }
  };

  const handleDelete = async (docId: string) => {
    try {
      await deleteDocument(docId);
      toast(t("deleteSuccess"), "success");
      setDeleteDoc(null);
      onRefresh?.();
    } catch {
      toast("Failed to delete document", "error");
    }
  };

  const handleOpenNewTab = (docId: string) => {
    window.open(buildReaderPath(docId, locale), "_blank");
  };

  const handleToggleSaved = async (doc: DocumentRow) => {
    const isSaved = doc.savedAt !== null;
    try {
      await toggleSaved(doc.docId, !isSaved);
      toast(isSaved ? t("removedFromSaved") : t("savedForLater"), "success");
      onRefresh?.();
    } catch {
      toast(t("saveError"), "error");
    }
  };

  return (
    <>
      <div className="space-y-0.5">
        {documents.map((doc) => (
          <div
            key={doc.docId}
            className={cn(
              "group flex items-center gap-3",
              "px-3 py-2 -mx-1 rounded-lg",
              "transition-all duration-150 ease-out",
              "hover:bg-surface-2/50",
              "active:bg-surface-2/70 active:scale-[0.995]"
            )}
          >
            {/* Main clickable area */}
            <Link href={`/reader/${doc.docId}`} className="flex items-center gap-3 flex-1 min-w-0">
              {/* Icon - Linear style: subtle container, clean icon */}
              <div
                className={cn(
                  "flex items-center justify-center shrink-0",
                  "w-8 h-8 rounded-lg",
                  "bg-surface-2/40 group-hover:bg-surface-2/70",
                  "transition-all duration-150 ease-out",
                  "group-hover:scale-[1.02]"
                )}
              >
                <FileText
                  className={cn(
                    "h-4 w-4",
                    "text-muted-foreground/60 group-hover:text-muted-foreground",
                    "transition-colors duration-150"
                  )}
                  aria-hidden="true"
                />
              </div>

              {/* Content - Linear style: tight leading, subtle metadata */}
              <div className="flex-1 min-w-0 py-0.5">
                <span
                  className={cn(
                    "text-[13px] font-medium leading-tight",
                    "text-foreground/90 group-hover:text-foreground",
                    "truncate block",
                    "transition-colors duration-150"
                  )}
                >
                  {doc.title ?? t("untitled")}
                </span>
                <span className="text-[11px] text-muted-foreground/60 leading-tight mt-0.5 block">
                  Updated {formatDate(doc.updatedAt)}
                </span>
              </div>
            </Link>

            {/* Actions menu - Linear style: fade in on hover */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "p-1.5 rounded-md shrink-0",
                    "opacity-0 group-hover:opacity-100",
                    "text-muted-foreground/60 hover:text-foreground",
                    "hover:bg-surface-3/60 active:bg-surface-3/80",
                    "transition-all duration-150 ease-out",
                    "focus:opacity-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  )}
                  aria-label="Document actions"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40 animate-in fade-in-0 zoom-in-95">
                <DropdownMenuItem
                  onClick={() => handleToggleSaved(doc)}
                  className="gap-2 text-[13px]"
                >
                  {doc.savedAt !== null ? (
                    <>
                      <BookmarkCheck className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
                      {t("removeFromSaved")}
                    </>
                  ) : (
                    <>
                      <Bookmark className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
                      {t("saveForLater")}
                    </>
                  )}
                </DropdownMenuItem>
                <DropdownMenuSeparator className="my-1" />
                <DropdownMenuItem
                  onClick={() => handleOpenNewTab(doc.docId)}
                  className="gap-2 text-[13px]"
                >
                  <ExternalLink className="h-3.5 w-3.5 opacity-60" />
                  {t("openInNewTab")}
                </DropdownMenuItem>
                <DropdownMenuSeparator className="my-1" />
                <DropdownMenuItem onClick={() => setRenameDoc(doc)} className="gap-2 text-[13px]">
                  <Pencil className="h-3.5 w-3.5 opacity-60" />
                  {t("rename")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setDeleteDoc(doc)}
                  className="gap-2 text-[13px] text-error/90 focus:text-error focus:bg-error/10"
                >
                  <Trash2 className="h-3.5 w-3.5 opacity-70" />
                  {t("delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
      </div>

      {/* Rename dialog */}
      {renameDoc && (
        <RenameDocumentDialog
          open={Boolean(renameDoc)}
          onOpenChange={(open) => !open && setRenameDoc(null)}
          documentTitle={renameDoc.title ?? ""}
          onRename={(newTitle) => handleRename(renameDoc.docId, newTitle)}
        />
      )}

      {/* Delete confirmation dialog */}
      {deleteDoc && (
        <DeleteDocumentDialog
          open={Boolean(deleteDoc)}
          onOpenChange={(open) => !open && setDeleteDoc(null)}
          documentTitle={deleteDoc.title ?? t("untitled")}
          onConfirm={() => handleDelete(deleteDoc.docId)}
        />
      )}
    </>
  );
}
