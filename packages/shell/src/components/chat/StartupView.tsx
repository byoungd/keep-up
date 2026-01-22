"use client";
import { ArrowRight, Lightbulb, MessageSquare, Sparkles, Zap } from "lucide-react";
import { Suggestion } from "../ai-elements/suggestion";

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

  const showSuggestions = suggestions.length > 0;

  return (
    <div className="h-full flex flex-col items-center justify-center px-6 py-10 animate-in fade-in duration-slow">
      <div className="flex flex-col items-center text-center max-w-2xl">
        <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        <p className="mt-4 text-sm md:text-base text-muted-foreground leading-relaxed max-w-xl">
          {description}
        </p>
      </div>

      {showSuggestions && (
        <div className="mt-10 flex flex-wrap items-center justify-center gap-2.5 max-w-2xl">
          {suggestions.map((label, i) => {
            const Icon = getIcon(i);
            return (
              <Suggestion
                key={label}
                suggestion={label}
                onClick={onSuggestionClick}
                size="default"
                className="group gap-2 rounded-full border border-border/50 bg-surface-1/70 text-xs font-medium text-foreground/80 hover:text-foreground hover:border-border/80 hover:bg-surface-2/70 transition-colors duration-fast"
              >
                <Icon
                  className="h-4 w-4 text-muted-foreground group-hover:text-foreground/80"
                  aria-hidden="true"
                />
                <span>{label}</span>
                <ArrowRight
                  className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-foreground/70 transition-colors duration-fast"
                  aria-hidden="true"
                />
              </Suggestion>
            );
          })}
        </div>
      )}
    </div>
  );
}
