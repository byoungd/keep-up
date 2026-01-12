import { cn } from "@keepup/shared/utils";
import { ArrowRight, FileJson } from "lucide-react";

/**
 * BlockPreview - Type for structural diff visualization
 * Represents a block in the preview tree (flexible shape from CanonNode)
 */
interface BlockLike {
  id?: string;
  type?: string;
  children?: ReadonlyArray<BlockLike>;
}

interface StructuralDiffProps {
  originalBlocks: ReadonlyArray<unknown>;
  previewBlocks: ReadonlyArray<unknown>;
  className?: string;
}

export function StructuralDiff({ originalBlocks, previewBlocks, className }: StructuralDiffProps) {
  const renderBlock = (block: unknown, depth = 0): React.ReactNode => {
    const b = block as BlockLike;
    const blockId = b.id ?? `block-${Math.random().toString(36).slice(2, 8)}`;
    const blockType = b.type ?? "block";

    return (
      <div key={blockId} className="my-1" style={{ paddingLeft: depth * 12 }}>
        <div className="flex items-center gap-2 p-1.5 rounded bg-surface-2 border border-border/50 text-xs font-mono">
          <span className="text-accent-blue font-semibold">{blockType}</span>
          {b.id && (
            <span className="text-muted-foreground truncate max-w-[150px]">
              {b.id.slice(0, 8)}...
            </span>
          )}
          {b.children && b.children.length > 0 && (
            <span className="bg-surface-3 px-1 rounded text-[10px] text-muted-foreground">
              {b.children.length} children
            </span>
          )}
        </div>
        {b.children?.map((child) => renderBlock(child, depth + 1))}
      </div>
    );
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-3 p-4 bg-surface-1 rounded-xl border border-border shadow-lg",
        className
      )}
    >
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground border-b border-border/50 pb-2">
        <FileJson className="w-4 h-4 text-accent-indigo" />
        <span>Structural Refactoring Preview</span>
      </div>

      <div className="grid grid-cols-[1fr,auto,1fr] gap-4 items-start">
        {/* Original */}
        <div className="flex flex-col gap-2">
          <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
            Original
          </span>
          <div className="p-2 bg-surface-0 rounded-lg border border-border/30 min-h-[100px]">
            {originalBlocks.map((b) => renderBlock(b))}
          </div>
        </div>

        {/* Arrow */}
        <div className="flex items-center justify-center self-stretch py-8">
          <ArrowRight className="w-5 h-5 text-muted-foreground/50" />
        </div>

        {/* Preview */}
        <div className="flex flex-col gap-2">
          <span className="text-[10px] uppercase font-bold text-success tracking-wider">
            Proposed
          </span>
          <div className="p-2 bg-success/10 rounded-lg border border-success/30 min-h-[100px]">
            {previewBlocks.map((b) => renderBlock(b))}
          </div>
        </div>
      </div>

      <div className="text-[10px] text-muted-foreground text-center pt-1">
        AI will restructure these blocks. Content is preserved.
      </div>
    </div>
  );
}
