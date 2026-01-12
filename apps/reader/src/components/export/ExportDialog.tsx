"use client";

import { useLfccEditorContext } from "@/components/lfcc/LfccEditorContext";
import {
  type ExportFormat,
  type ExportProgress,
  downloadExport,
  exportDocument,
} from "@/lib/export";
import { cn } from "@keepup/shared/utils";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Download, FileText, Globe, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type ExportDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  documentTitle?: string;
};

type FormatOption = {
  id: ExportFormat;
  label: string;
  description: string;
  icon: React.ReactNode;
  available: boolean;
};

const FORMAT_OPTIONS: FormatOption[] = [
  {
    id: "markdown",
    label: "Markdown",
    description: "Plain text with formatting. Great for GitHub, notes apps.",
    icon: <FileText className="w-5 h-5" />,
    available: true,
  },
  {
    id: "html",
    label: "HTML",
    description: "Self-contained web page with styling.",
    icon: <Globe className="w-5 h-5" />,
    available: true,
  },
  {
    id: "pdf",
    label: "PDF",
    description: "Print-ready document. Opens print dialog.",
    icon: <FileText className="w-5 h-5" />,
    available: true,
  },
  {
    id: "docx",
    label: "Word",
    description: "Microsoft Word format. Coming soon.",
    icon: <FileText className="w-5 h-5" />,
    available: false,
  },
];

export function ExportDialog({ isOpen, onClose, documentTitle }: ExportDialogProps) {
  const context = useLfccEditorContext();
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>("markdown");
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [isDone, setIsDone] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const handleExport = async () => {
    if (!context?.view) {
      return;
    }

    setIsExporting(true);
    setProgress({ stage: "preparing", percent: 0 });

    try {
      const doc = context.view.state.doc;
      const result = await exportDocument(
        doc,
        selectedFormat,
        {
          title: documentTitle || "Untitled Document",
          includeMeta: true,
          embedImages: false,
        },
        setProgress
      );

      if (selectedFormat === "pdf") {
        // For PDF, open in new window and trigger print
        const printWindow = window.open("", "_blank");
        if (printWindow) {
          printWindow.document.write(result.content as string);
          printWindow.document.close();
          printWindow.focus();
          setTimeout(() => printWindow.print(), 250);
        }
      } else {
        downloadExport(result);
      }

      setIsDone(true);
      setTimeout(() => {
        setIsDone(false);
        onClose();
      }, 1500);
    } catch (error) {
      console.error("Export failed:", error);
      setProgress({ stage: "complete", percent: 0, message: "Export failed" });
    } finally {
      setIsExporting(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="bg-popover border border-border rounded-xl shadow-2xl w-full max-w-md p-6"
          data-testid="export-dialog"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-accent-indigo/10 flex items-center justify-center">
                <Download className="w-5 h-5 text-accent-indigo" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Export Document</h2>
                <p className="text-sm text-muted-foreground">Choose a format to download</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-muted/50 transition-colors"
            >
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>

          {/* Format Grid */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            {FORMAT_OPTIONS.map((format) => (
              <button
                key={format.id}
                type="button"
                disabled={!format.available || isExporting}
                onClick={() => setSelectedFormat(format.id)}
                className={cn(
                  "relative flex flex-col items-start p-4 rounded-lg border transition-all text-left",
                  format.available
                    ? "hover:border-accent-indigo/50 hover:bg-accent-indigo/5"
                    : "opacity-50 cursor-not-allowed",
                  selectedFormat === format.id && format.available
                    ? "border-accent-indigo bg-accent-indigo/5 ring-2 ring-accent-indigo/20"
                    : "border-border"
                )}
              >
                <div
                  className={cn(
                    "mb-2 p-2 rounded-md",
                    selectedFormat === format.id
                      ? "bg-accent-indigo/10 text-accent-indigo"
                      : "bg-muted/50 text-muted-foreground"
                  )}
                >
                  {format.icon}
                </div>
                <span className="font-medium text-sm">{format.label}</span>
                <span className="text-[11px] text-muted-foreground leading-tight mt-1">
                  {format.description}
                </span>
                {selectedFormat === format.id && format.available && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute top-2 right-2 w-5 h-5 rounded-full bg-accent-indigo flex items-center justify-center"
                  >
                    <Check className="w-3 h-3 text-white" />
                  </motion.div>
                )}
              </button>
            ))}
          </div>

          {/* Progress */}
          {isExporting && progress && (
            <div className="mb-4">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-muted-foreground">{progress.message}</span>
                <span className="text-muted-foreground">{progress.percent}%</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-accent-indigo"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress.percent}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isExporting}
              className="flex-1 px-4 py-2.5 rounded-lg border border-border text-sm font-medium hover:bg-muted/50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={isExporting || isDone}
              className={cn(
                "flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2",
                isDone
                  ? "bg-success text-success-foreground"
                  : "bg-accent-indigo text-white hover:bg-accent-indigo/90"
              )}
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Exporting...
                </>
              ) : isDone ? (
                <>
                  <Check className="w-4 h-4" />
                  Done!
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Export
                </>
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
