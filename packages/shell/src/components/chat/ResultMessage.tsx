import { motion } from "framer-motion";
import { CheckCircle2, Code, Download, File, FileText, Image as ImageIcon } from "lucide-react";
import type { ArtifactItem } from "./types";

interface ResultMessageProps {
  content: string;
  artifacts?: ArtifactItem[];
  onPreview?: (artifact: ArtifactItem) => void;
}

export function ResultMessage({ content, artifacts, onPreview }: ResultMessageProps) {
  const hasArtifacts = artifacts && artifacts.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-[90%] md:max-w-2xl w-full space-y-4"
    >
      {/* Main Result Card */}
      <div className="bg-gradient-to-br from-surface-1 to-surface-2 border border-green-500/20 rounded-xl overflow-hidden shadow-lg shadow-green-500/5">
        <div className="p-5 flex gap-4">
          <div className="shrink-0">
            <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center text-green-500">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="flex-1 space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-green-500/80">
              Task Completed
            </div>
            <div className="text-base text-foreground leading-relaxed prose prose-sm dark:prose-invert max-w-none">
              {/* We'll assume content is markdown-ready or simple text */}
              {content}
            </div>
          </div>
        </div>
      </div>

      {/* Attachments List (Spec 2.2.2) */}
      {hasArtifacts && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-12">
          {artifacts.map((artifact) => (
            <AttachmentCard
              key={artifact.id}
              artifact={artifact}
              onClick={() => onPreview?.(artifact)}
            />
          ))}
        </div>
      )}
    </motion.div>
  );
}

function AttachmentCard({ artifact, onClick }: { artifact: ArtifactItem; onClick?: () => void }) {
  const Icon = getArtifactIcon(artifact.type);

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 p-3 bg-surface-1 border border-border/40 rounded-lg hover:border-primary/30 hover:bg-surface-1/80 hover:shadow-md transition-all duration-200 group cursor-pointer active:scale-[0.99]"
    >
      <div className="w-10 h-10 rounded-md bg-surface-2 group-hover:bg-primary/5 flex items-center justify-center text-muted-foreground group-hover:text-primary transition-colors border border-border/10">
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate group-hover:text-foreground transition-colors text-foreground/80">
          {artifact.title || "Untitled Artifact"}
        </div>
        <div className="text-[10px] text-muted-foreground capitalize flex items-center gap-1 mb-1.5">
          <span className="w-1 h-1 rounded-full bg-muted-foreground/40" />
          {artifact.type}
        </div>

        {/* Content Preview (Spec 5.3) */}
        {artifact.content &&
          (artifact.type === "doc" ||
            artifact.type === "code" ||
            artifact.type === "report" ||
            artifact.type === "diff") && (
            <div className="text-[10px] text-muted-foreground/70 bg-surface-2/50 rounded px-1.5 py-1 font-mono leading-relaxed line-clamp-3 overflow-hidden border border-border/10">
              {artifact.content.slice(0, 150)}
            </div>
          )}
      </div>
      <span
        className="p-2 text-muted-foreground/50 hover:text-primary hover:bg-primary/10 rounded-md opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0"
        aria-hidden="true"
      >
        <Download className="w-4 h-4" />
      </span>
    </button>
  );
}

function getArtifactIcon(type: string) {
  switch (type) {
    case "image":
      return ImageIcon;
    case "code":
      return Code;
    case "doc":
    case "report":
      return FileText;
    default:
      return File;
  }
}
