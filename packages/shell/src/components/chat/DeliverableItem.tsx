import { cn } from "@ku0/shared/utils";
import { motion } from "framer-motion";
import { buildPreviewText, getArtifactIcon } from "./TaskStreamUtils";
import type { ArtifactItem } from "./types";

export function DeliverableItem({
  artifact,
  onPreview,
  isPrimary = false,
}: {
  artifact: ArtifactItem;
  onPreview?: (artifact: ArtifactItem) => void;
  isPrimary?: boolean;
}) {
  const Icon = getArtifactIcon(artifact.type);
  const preview = buildPreviewText(artifact.content);
  const statusLabel = resolveArtifactStatusLabel(artifact.status);
  const statusClass = resolveArtifactStatusClass(artifact.status);

  return (
    <motion.button
      type="button"
      layoutId={`artifact-${artifact.id}`}
      transition={{ duration: 0.2, ease: "easeOut" }}
      onClick={() => onPreview?.(artifact)}
      className={cn(
        "group flex flex-col items-start gap-2 p-3 rounded-lg border border-transparent bg-surface-2/30 hover:bg-surface-2 hover:border-border/50 hover:shadow-sm hover:scale-[1.01] active:scale-[0.99] text-left transition-all duration-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        isPrimary && "border-primary/20 bg-primary/5"
      )}
    >
      <div className="flex items-center gap-2 w-full">
        <div className="h-7 w-7 rounded-md bg-background flex items-center justify-center text-muted-foreground group-hover:text-foreground group-hover:shadow-sm transition-all duration-fast">
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-foreground truncate group-hover:text-primary transition-colors duration-fast">
            {artifact.title || "Untitled"}
          </div>
          <div className="text-micro text-muted-foreground uppercase tracking-wider">
            {artifact.type}
          </div>
        </div>
        {statusLabel && (
          <span
            className={cn(
              "text-micro uppercase tracking-wider px-2 py-0.5 rounded-full border",
              statusClass
            )}
          >
            {statusLabel}
          </span>
        )}
        {isPrimary && <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />}
      </div>

      {/* Content Preview if text */}
      {preview && (artifact.type === "doc" || artifact.type === "report") && (
        <div className="w-full text-micro text-muted-foreground/70 line-clamp-2 leading-relaxed">
          {preview}
        </div>
      )}
    </motion.button>
  );
}

function resolveArtifactStatusLabel(status?: ArtifactItem["status"]): string | null {
  if (status === "applied") {
    return "Applied";
  }
  if (status === "reverted") {
    return "Reverted";
  }
  return null;
}

function resolveArtifactStatusClass(status?: ArtifactItem["status"]): string {
  if (status === "applied") {
    return "border-success/30 text-success bg-success/10";
  }
  if (status === "reverted") {
    return "border-warning/30 text-warning bg-warning/10";
  }
  return "border-border/50 text-muted-foreground bg-surface-2/40";
}
