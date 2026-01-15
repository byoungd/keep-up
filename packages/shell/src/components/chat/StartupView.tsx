"use client";
import { ArrowRight, Bot, Lightbulb, MessageSquare, Sparkles, Zap } from "lucide-react";

export interface StartupViewProps {
  title: string;
  description: string;
  suggestions: string[];
  onSuggestionClick: (suggestion: string) => void;
}

export function StartupView({
  title,
  description,
  suggestions,
  onSuggestionClick,
}: StartupViewProps) {
  // Map suggestions to icons (simple heuristic or cycling)
  const getIcon = (index: number) => {
    const icons = [MessageSquare, Sparkles, Zap, Lightbulb];
    return icons[index % icons.length];
  };

  return (
    <div className="h-full flex flex-col items-center justify-center p-6 animate-in fade-in duration-500">
      {/* Hero Section */}
      <div className="flex flex-col items-center space-y-5 mb-10 max-w-sm text-center">
        <div className="relative">
          <div className="relative h-14 w-14 rounded-2xl bg-surface-1 border border-border/60 flex items-center justify-center shadow-sm">
            <Bot className="h-7 w-7 text-foreground/80" aria-hidden="true" />
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-lg font-semibold tracking-tight text-foreground/90">{title}</h2>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-[280px] mx-auto">
            {description}
          </p>
        </div>
      </div>

      {/* Suggestions Grid */}
      <div className="grid grid-cols-1 w-full max-w-[320px] gap-2.5">
        <div className="text-[10px] font-medium text-foreground/70 uppercase tracking-widest pl-1 mb-1">
          Suggestions
        </div>
        {suggestions.map((label, i) => {
          const Icon = getIcon(i);
          return (
            <button
              key={label}
              type="button"
              onClick={() => onSuggestionClick(label)}
              className="group relative flex items-center gap-3 p-3 text-left rounded-xl bg-surface-1 hover:bg-surface-2 border border-border/40 hover:border-border/70 transition-colors duration-200"
              style={{ animationDelay: `${i * 100}ms` }}
            >
              <div className="h-8 w-8 rounded-lg bg-surface-0 flex items-center justify-center shrink-0 border border-border/50">
                <Icon
                  className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors"
                  aria-hidden="true"
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-foreground/80 group-hover:text-foreground truncate transition-colors">
                  {label}
                </div>
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-foreground/70 -translate-x-1 group-hover:translate-x-0 opacity-0 group-hover:opacity-100 transition-all duration-200" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
