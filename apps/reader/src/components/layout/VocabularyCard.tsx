import { cn } from "@ku0/shared/utils";
import { Play, Plus } from "lucide-react";
import * as React from "react";

export interface VocabularyItem {
  word: string;
  pronunciation?: string;
  definition: string;
  partOfSpeech: string; // e.g., "verb", "noun"
  example: string;
}

interface VocabularyCardProps {
  items: VocabularyItem[];
  onAdd: (item: VocabularyItem) => void;
  onPlayAudio?: (text: string) => void;
  className?: string;
}

export const VocabularyCard = React.memo(function VocabularyCard({
  items,
  onAdd,
  onPlayAudio,
  className,
}: VocabularyCardProps) {
  if (!items || items.length === 0) {
    return null;
  }

  return (
    <div className={cn("grid gap-3 w-full max-w-sm", className)}>
      {items.map((item, index) => (
        <div
          key={`${item.word}-${index}`}
          className="group relative overflow-hidden rounded-xl border border-border/50 bg-card p-3 shadow-sm hover:border-primary/20 hover:shadow-md transition-all"
        >
          <div className="flex items-start justify-between gap-3">
            {/* Word & Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <h4 className="text-base font-semibold tracking-tight text-card-foreground">
                  {item.word}
                </h4>
                {item.pronunciation && (
                  <span className="text-xs text-muted-foreground font-mono opacity-80">
                    /{item.pronunciation}/
                  </span>
                )}
              </div>

              <div className="mt-1 flex items-center gap-1.5 ">
                <span className="inline-flex items-center rounded-md bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent-foreground ring-1 ring-inset ring-accent/20">
                  {item.partOfSpeech}
                </span>
                <p className="text-xs text-muted-foreground line-clamp-2">{item.definition}</p>
              </div>

              {item.example && (
                <div className="mt-3 pt-2 border-t border-border/40">
                  <p className="text-xs text-muted-foreground/80 italic">"{item.example}"</p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <button
                type="button"
                onClick={() => onAdd(item)}
                className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
                title="Add to Flashcards"
              >
                <Plus className="h-4 w-4" />
              </button>
              {onPlayAudio && (
                <button
                  type="button"
                  onClick={() => onPlayAudio(item.word)}
                  className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-accent/10 text-accent-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                  title="Pronounce"
                >
                  <Play className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
});
