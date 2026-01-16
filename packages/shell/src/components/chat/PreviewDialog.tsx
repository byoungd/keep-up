"use client";

import {
  Check,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Link as LinkIcon,
  Printer,
  Share,
} from "lucide-react";
import * as React from "react";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/DropdownMenu";
import type { ArtifactItem } from "./types";

export interface PreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  artifact: ArtifactItem;
}

export function PreviewDialog({ open, onOpenChange, artifact }: PreviewDialogProps) {
  const [isCopied, setIsCopied] = React.useState(false);

  // Auto-reset copy state
  React.useEffect(() => {
    if (isCopied) {
      const timer = setTimeout(() => setIsCopied(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [isCopied]);

  const handleCopy = () => {
    if (artifact.content) {
      navigator.clipboard.writeText(artifact.content);
      setIsCopied(true);
    }
  };

  const handleExport = (_format: string) => {
    // Mock export function
    // In a real app, this would trigger a download
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={artifact.title}
      // ... (middle content same)
      size="xl"
      className="h-[85vh] flex flex-col p-0 gap-0 overflow-hidden bg-surface-1 border-border/20 shadow-2xl"
    >
      <div className="flex items-center justify-between px-6 py-4 border-b border-border/10 shrink-0 bg-surface-1/50 backdrop-blur-sm z-10">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-surface-2 text-muted-foreground shrink-0 border border-border/10">
            {getArtifactIcon(artifact.type)}
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold truncate text-foreground">{artifact.title}</h3>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="capitalize">{artifact.type}</span>
              <span className="w-1 h-1 rounded-full bg-border" />
              <span>{formatDate(artifact.createdAt)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-surface-2/30 relative">
        <div className="max-w-4xl mx-auto p-8 min-h-full">{renderContent(artifact)}</div>
      </div>

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20">
        <div className="flex items-center gap-1 p-1.5 rounded-full bg-surface-1/90 backdrop-blur-md border border-border/20 shadow-xl ring-1 ring-black/5 dark:ring-white/5">
          <Button
            variant="ghost"
            size="sm"
            className="rounded-full h-9 px-4 gap-2 text-muted-foreground hover:text-foreground"
            onClick={handleCopy}
          >
            {isCopied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            <span>{isCopied ? "Copied" : "Copy"}</span>
          </Button>

          <div className="w-px h-4 bg-border/20 mx-1" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="primary" size="sm" className="rounded-full h-9 px-4 gap-2 shadow-sm">
                <Download className="w-4 h-4" />
                <span>Export</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" side="top" className="w-48 mb-2">
              <DropdownMenuLabel>Export As...</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleExport("pdf")}>
                <Printer className="w-4 h-4 mr-2" /> PDF Document
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport("markdown")}>
                <FileText className="w-4 h-4 mr-2" /> Markdown
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport("drive")}>
                <Share className="w-4 h-4 mr-2" /> Save to Drive
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </Dialog>
  );
}

// --- Helpers ---

function getArtifactIcon(type: string) {
  switch (type) {
    case "image":
      return <ImageIcon className="w-4 h-4" />;
    case "link":
      return <LinkIcon className="w-4 h-4" />;
    case "code":
    case "diff":
      return <FileText className="w-4 h-4" />;
    default:
      return <FileText className="w-4 h-4" />;
  }
}

function formatDate(dateStr?: string) {
  if (!dateStr) {
    return "Just now";
  }
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderContent(artifact: ArtifactItem) {
  if (artifact.type === "image") {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <img
          src={artifact.previewUrl || artifact.url}
          alt={artifact.title}
          className="max-w-full rounded-lg shadow-sm border border-border/10"
        />
      </div>
    );
  }

  if (artifact.type === "link") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] text-center p-8">
        <div className="w-16 h-16 rounded-2xl bg-surface-2 flex items-center justify-center mb-6">
          <LinkIcon className="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 className="text-xl font-semibold mb-2">External Link</h3>
        <p className="text-muted-foreground mb-6 max-w-md break-all">{artifact.url}</p>
        <Button variant="outline" onClick={() => window.open(artifact.url, "_blank")}>
          Open in Browser <ExternalLink className="w-4 h-4 ml-2" />
        </Button>
      </div>
    );
  }

  // Default: Text/Code/Doc
  // Note: In strict Manus design, this would be a full Markdown renderer.
  // Proceeding with pre-wrap for now as per plan, ensuring correct fonts.
  return (
    <div className="prose dark:prose-invert max-w-none">
      {/* If it's code, wrap in a styling block */}
      {artifact.type === "code" || artifact.type === "diff" ? (
        <div className="rounded-xl overflow-hidden border border-border/20 bg-surface-1">
          <div className="flex items-center px-4 py-2 border-b border-border/10 bg-surface-2/30">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500/20" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/20" />
              <div className="w-3 h-3 rounded-full bg-green-500/20" />
            </div>
          </div>
          <pre className="p-4 overflow-x-auto text-sm font-mono leading-relaxed bg-transparent">
            <code>{artifact.content || "No content available."}</code>
          </pre>
        </div>
      ) : (
        <div className="whitespace-pre-wrap font-sans text-base leading-relaxed text-foreground/90">
          {/* If we had a message/markdown parser, we'd use it here. */}
          {/* For now, text is text. */}
          {artifact.content || "No content available."}
        </div>
      )}
    </div>
  );
}
