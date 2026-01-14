"use client";

import { cn } from "@ku0/shared/utils";
import { ArrowRight, Sparkles } from "lucide-react";
import * as React from "react";

interface ProactiveSuggestionCardProps {
  title: string;
  description: string;
  actionPrompt: string;
  onSelect: (prompt: string) => void;
  icon?: React.ElementType;
}

export function ProactiveSuggestionCard({
  title,
  description,
  actionPrompt,
  onSelect,
  icon: Icon = Sparkles,
}: ProactiveSuggestionCardProps) {
  const [isHovered, setIsHovered] = React.useState(false);

  const handleClick = () => {
    onSelect(actionPrompt);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        "group relative w-full text-left p-4 rounded-xl transition-all duration-300",
        "bg-surface-1 border border-border/50 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5",
        "flex items-start gap-4"
      )}
    >
      <div
        className={cn(
          "p-2.5 rounded-lg transition-colors duration-300",
          "bg-primary/5 text-primary group-hover:bg-primary group-hover:text-primary-foreground"
        )}
      >
        <Icon className="w-5 h-5" aria-hidden="true" />
      </div>

      <div className="flex-1 space-y-1">
        <h4 className="font-medium text-foreground text-sm group-hover:text-primary transition-colors">
          {title}
        </h4>
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{description}</p>
      </div>

      <div
        className={cn(
          "absolute right-4 top-1/2 -translate-y-1/2 transition-all duration-300 opacity-0 transform translate-x-2",
          isHovered && "opacity-100 translate-x-0"
        )}
      >
        <ArrowRight className="w-4 h-4 text-primary" aria-hidden="true" />
      </div>
    </button>
  );
}
