import { Button } from "@/components/ui/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import type { ModelCapability } from "@/lib/ai/models";
import { cn } from "@keepup/shared/utils";
import { Download, History, MoreHorizontal, PanelRightClose, Plus } from "lucide-react";
import { ModelSelector, type PanelPosition } from "./ModelSelector";

export interface AIPanelHeaderProps {
  title: string;
  model: string;
  setModel: (model: string) => void;
  filteredModels: ModelCapability[];
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
}

export function AIPanelHeader({
  model,
  setModel,
  filteredModels,
  isStreaming,
  isLoading,
  onClose,
  onClear,
  onExport,
  onHistory,
  translations,
  panelPosition = "right",
}: AIPanelHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-border/20 shrink-0 bg-surface-0/50 backdrop-blur-md z-10">
      {/* Left: Model + Status */}
      <div className="flex items-center gap-3 min-w-0">
        <ModelSelector
          model={model}
          models={filteredModels}
          onSelect={setModel}
          className="-ml-1"
          panelPosition={panelPosition}
        />
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

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 rounded-lg text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors duration-100"
          onClick={onClose}
          aria-label={translations.closePanel}
        >
          <PanelRightClose className="h-4 w-4" />
        </Button>
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
