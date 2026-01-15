"use client";

import { cn } from "@ku0/shared/utils";
import { BookOpen, FileText, Languages, List, Search } from "lucide-react";
import type * as React from "react";
import type { AIPrompt } from "../../lib/ai/types";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  BookOpen,
  FileText,
  Languages,
  Search,
  List,
};

interface SlashCommandMenuProps {
  isOpen: boolean;
  filter: string;
  selectedIndex: number;
  onSelect: (prompt: AIPrompt) => void;
  onClose: () => void;
  position: { top: number; left: number };
  prompts: AIPrompt[];
}

export function SlashCommandMenu({
  isOpen,
  filter,
  selectedIndex,
  onSelect,
  position,
  prompts,
}: SlashCommandMenuProps) {
  if (!isOpen) {
    return null;
  }

  const filteredPrompts = prompts.filter(
    (p) =>
      p.label.toLowerCase().includes(filter.toLowerCase()) ||
      p.description.toLowerCase().includes(filter.toLowerCase())
  );

  if (filteredPrompts.length === 0) {
    return null;
  }

  const activeIndex =
    ((selectedIndex % filteredPrompts.length) + filteredPrompts.length) % filteredPrompts.length;
  const activePrompt = filteredPrompts[activeIndex];
  const activeId = activePrompt ? `slash-command-${activePrompt.id}` : undefined;

  return (
    <div
      className="fixed z-50 w-64 overflow-hidden rounded-lg border border-border/50 bg-background/95 p-1 text-popover-foreground shadow-md backdrop-blur-md animate-in fade-in zoom-in-95 duration-100"
      tabIndex={-1}
      style={{
        top: position.top,
        left: position.left,
        transform: "translateY(-100%)", // Show above the cursor/input
        marginTop: "-8px",
      }}
      // biome-ignore lint/a11y/useSemanticElements: Custom dropdown
      role="listbox"
      aria-label="Slash commands"
      aria-activedescendant={activeId}
    >
      <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Commands</div>
      {filteredPrompts.map((prompt, index) => {
        const Icon = prompt.icon ? ICON_MAP[prompt.icon] : BookOpen;
        const isSelected = index === activeIndex;
        const optionId = `slash-command-${prompt.id}`;

        return (
          <div
            key={prompt.id}
            onClick={() => onSelect(prompt)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(prompt);
              }
            }}
            tabIndex={-1}
            className={cn(
              "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none transition-colors",
              isSelected
                ? "bg-accent text-accent-foreground"
                : "hover:bg-accent/50 hover:text-accent-foreground"
            )}
            // biome-ignore lint/a11y/useSemanticElements: Custom option
            role="option"
            id={optionId}
            aria-selected={isSelected}
          >
            <div className="flex h-5 w-5 items-center justify-center rounded bg-background/50 border border-border/30">
              {Icon && <Icon className="h-3 w-3" />}
            </div>
            <div className="flex flex-col items-start overflow-hidden">
              <span className="truncate font-medium leading-none">{prompt.label}</span>
              <span className="truncate text-[10px] text-muted-foreground mt-0.5 opacity-80">
                {prompt.description}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
