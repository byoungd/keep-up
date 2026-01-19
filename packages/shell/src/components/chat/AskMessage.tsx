import { cn } from "@ku0/shared/utils";
import { motion } from "framer-motion";
import { AlertCircle, Check, Globe, Lock, MonitorPlay, X } from "lucide-react";

interface AskMessageProps {
  content: string;
  suggestedAction?:
    | "none"
    | "confirm_browser_operation"
    | "take_over_browser"
    | "upgrade_to_unlock_feature";
  metadata?: Record<string, unknown>;
  onAction?: (action: string, data?: unknown) => void;
}

function MetadataView({ metadata }: { metadata: Record<string, unknown> }) {
  if (!metadata.toolName) {
    return null;
  }

  return (
    <div className="text-fine font-mono bg-surface-2/50 rounded-lg p-2.5 text-muted-foreground border border-border/10">
      <div className="flex justify-between items-center mb-1.5">
        <span className="font-semibold text-foreground/80">{String(metadata.toolName)}</span>
        {!!metadata.riskLevel && (
          <span
            className={cn(
              "uppercase text-tiny font-bold px-1.5 py-px rounded-[4px] tracking-wider",
              (metadata.riskLevel as string) === "high"
                ? "bg-error/10 text-error"
                : "bg-info/10 text-info"
            )}
          >
            {String(metadata.riskLevel)}
          </span>
        )}
      </div>
      {!!metadata.args && (
        <div className="opacity-70 truncate select-all">
          {JSON.stringify(metadata.args).slice(0, 100)}
        </div>
      )}
    </div>
  );
}

function ActionButtons({
  suggestedAction,
  onAction,
}: {
  suggestedAction: string;
  onAction?: (action: string, data?: unknown) => void;
}) {
  if (suggestedAction === "confirm_browser_operation") {
    return (
      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={() => onAction?.("approve")}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-warning text-warning-foreground rounded-lg hover:bg-warning/90 transition-all duration-fast hover:scale-[1.02] active:scale-[0.98] shadow-md shadow-warning/20 text-sm font-medium"
        >
          <Check className="w-4 h-4" />
          Allow
        </button>
        <button
          type="button"
          onClick={() => onAction?.("deny")}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-surface-2 hover:bg-surface-3 transition-colors duration-fast rounded-lg text-sm text-muted-foreground hover:text-foreground border border-transparent hover:border-border/10"
        >
          <X className="w-4 h-4" />
          Deny
        </button>
      </div>
    );
  }

  if (suggestedAction === "take_over_browser") {
    return (
      <button
        type="button"
        onClick={() => onAction?.("launch_browser")}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-info text-info-foreground rounded-lg hover:bg-info/90 transition-all duration-fast hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-info/20 text-sm font-medium group-hover:shadow-info/30"
      >
        <MonitorPlay className="w-4 h-4 animate-pulse" />
        Launch Browser Control
      </button>
    );
  }

  if (suggestedAction === "upgrade_to_unlock_feature") {
    return (
      <button
        type="button"
        onClick={() => onAction?.("upgrade")}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-linear-to-r from-accent-violet to-accent-rose text-white rounded-lg hover:opacity-90 transition-all duration-fast hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-accent-violet/25 text-sm font-medium"
      >
        <Lock className="w-4 h-4" />
        Upgrade to Pro
      </button>
    );
  }

  return null;
}

const GlowEffect = ({ suggestedAction }: { suggestedAction: string }) => {
  if (suggestedAction === "none") {
    return null;
  }

  const gradientClass =
    suggestedAction === "confirm_browser_operation"
      ? "from-warning/20 via-transparent to-transparent"
      : suggestedAction === "take_over_browser"
        ? "from-info/20 via-transparent to-transparent"
        : suggestedAction === "upgrade_to_unlock_feature"
          ? "from-accent-violet/30 via-accent-rose/10 to-transparent"
          : "hidden";

  return (
    <div
      className={cn(
        "absolute inset-0 opacity-20 pointer-events-none bg-linear-to-br",
        gradientClass
      )}
    />
  );
};

const IconWrapper = ({ suggestedAction }: { suggestedAction: string }) => {
  const containerClass =
    suggestedAction === "upgrade_to_unlock_feature"
      ? "bg-accent-violet/10 text-accent-violet"
      : suggestedAction === "confirm_browser_operation"
        ? "bg-warning/10 text-warning"
        : suggestedAction === "take_over_browser"
          ? "bg-info/10 text-info"
          : "bg-surface-2 text-muted-foreground";

  return (
    <div
      className={cn(
        "w-10 h-10 rounded-full flex items-center justify-center shadow-inner",
        containerClass
      )}
    >
      {suggestedAction === "upgrade_to_unlock_feature" ? (
        <Lock className="w-5 h-5" />
      ) : suggestedAction === "confirm_browser_operation" ? (
        <Globe className="w-5 h-5" />
      ) : suggestedAction === "take_over_browser" ? (
        <MonitorPlay className="w-5 h-5" />
      ) : (
        <AlertCircle className="w-5 h-5" />
      )}
    </div>
  );
};

export function AskMessage({
  content,
  suggestedAction = "none",
  metadata,
  onAction,
}: AskMessageProps) {
  const containerClass =
    suggestedAction === "upgrade_to_unlock_feature"
      ? "bg-linear-to-br from-surface-1 to-surface-2 border border-accent-violet/30 shadow-accent-violet/10"
      : "bg-surface-1 border border-border/50";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      layout
      className={cn(
        "max-w-[90%] md:max-w-md w-full rounded-xl overflow-hidden shadow-lg group relative",
        containerClass
      )}
    >
      <GlowEffect suggestedAction={suggestedAction} />

      <div className="p-5 flex gap-4 relative z-10">
        <div className="shrink-0 pt-0.5">
          <IconWrapper suggestedAction={suggestedAction} />
        </div>
        <div className="flex-1 space-y-4">
          <div className="text-sm font-medium text-foreground leading-relaxed">{content}</div>

          {metadata && <MetadataView metadata={metadata} />}

          <ActionButtons suggestedAction={suggestedAction} onAction={onAction} />
        </div>
      </div>
    </motion.div>
  );
}
