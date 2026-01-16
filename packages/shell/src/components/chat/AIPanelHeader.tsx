import { cn } from "@ku0/shared/utils";
import { Download, History, MoreHorizontal, PanelRightClose, Plus } from "lucide-react";
import { Button } from "../ui/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/DropdownMenu";
import type { PanelPosition } from "./ModelSelector";

export interface AIPanelHeaderProps {
  title: string;
  isStreaming: boolean;
  isLoading: boolean;
  onClose: () => void;
  onClear: () => void;
  onCopyLast: () => void;
  translations: {
    copyLast: string;
    newChat: string;
    closePanel: string;
    exportChat: string;
  };
  onExport: () => void;
  onHistory?: () => void;
  /** Which side of the screen this panel is on. Affects tooltip/dropdown directions. */
  panelPosition?: PanelPosition;
  showClose?: boolean;
}

export function AIPanelHeader({
  title,
  isStreaming,
  isLoading,
  onClose,
  onClear,
  onExport,
  onHistory,
  translations,
  panelPosition = "main",
  showClose = true,
}: AIPanelHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 px-3 py-2.5 shrink-0 z-10 backdrop-blur-md",
        // Standard Side Mode: Surface bg + border
        panelPosition !== "main" && "border-b border-border/20 bg-surface-0/50",
        // Main Mode: Transparent/Background match + no border + sticky feel
        panelPosition === "main" && "bg-background/80 supports-[backdrop-filter]:bg-background/60"
      )}
    >
      {/* Left: Model + Status */}
      <div className="flex items-center gap-3 min-w-0">
        <h3 className="text-sm font-medium pl-1">{title}</h3>
        <StatusDot isStreaming={isStreaming} isLoading={isLoading} />
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-surface-2/60 transition-colors duration-100"
          onClick={onClear}
          aria-label={translations.newChat}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-surface-2/60 transition-colors duration-100 disabled:opacity-20"
          onClick={onHistory}
          disabled={!onHistory}
          aria-label="History"
        >
          <History className="h-3.5 w-3.5" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-surface-2/60 transition-colors duration-100"
              aria-label="More"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="min-w-40 rounded-xl border-border/30 bg-surface-1/95 backdrop-blur-xl shadow-lg"
          >
            <DropdownMenuItem
              onClick={onExport}
              className="gap-2 cursor-pointer text-xs focus:bg-surface-2/60"
            >
              <Download className="h-3.5 w-3.5 text-muted-foreground" />
              <span>{translations.exportChat}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {showClose && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-lg text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors duration-100"
            onClick={onClose}
            aria-label={translations.closePanel}
          >
            <PanelRightClose className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

function StatusDot({ isStreaming, isLoading }: { isStreaming: boolean; isLoading: boolean }) {
  if (!isStreaming && !isLoading) {
    return null;
  }

  return (
    <span className="relative flex h-2 w-2">
      {/* Outer glow ring */}
      <span
        className={cn(
          "absolute -inset-1 rounded-full opacity-30 animate-ping",
          isStreaming ? "bg-success" : "bg-warning"
        )}
        style={{ animationDuration: "1.5s" }}
      />
      {/* Middle pulse ring */}
      <span
        className={cn(
          "absolute inline-flex h-full w-full rounded-full opacity-50",
          isStreaming ? "bg-success animate-pulse" : "bg-warning animate-pulse"
        )}
      />
      {/* Core dot with glow */}
      <span
        className={cn(
          "relative inline-flex rounded-full h-2 w-2",
          isStreaming
            ? "bg-success shadow-[0_0_6px_2px_rgba(34,197,94,0.4)]"
            : "bg-warning shadow-[0_0_6px_2px_rgba(234,179,8,0.4)]"
        )}
      />
    </span>
  );
}
