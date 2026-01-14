/**
 * Workflow Selector Component
 *
 * Allows users to select a predefined workflow for the AI assistant.
 * Styled with a premium "Linear-like" aesthetic.
 */

import { cn } from "@ku0/shared/utils";
import { Bug, Check, ChevronDown, Code, Library, Sparkles, TestTube } from "lucide-react";
import * as React from "react";

interface WorkflowOption {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const WORKFLOWS: WorkflowOption[] = [
  {
    id: "none",
    name: "Standard",
    description: "General-purpose assistance",
    icon: Sparkles,
  },
  {
    id: "tdd",
    name: "TDD Flow",
    description: "Test-first implementation",
    icon: TestTube,
  },
  {
    id: "refactoring",
    name: "Refactoring",
    description: "Safe code improvements",
    icon: Code,
  },
  {
    id: "debugging",
    name: "Debugging",
    description: "Systematic root cause analysis",
    icon: Bug,
  },
  {
    id: "research",
    name: "Research",
    description: "Deep dive & documentation",
    icon: Library,
  },
];

interface WorkflowSelectorProps {
  value: string;
  onChange: (workflow: string) => void;
  className?: string;
}

export function WorkflowSelector({ value, onChange, className = "" }: WorkflowSelectorProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const selected = WORKFLOWS.find((w) => w.id === value) || WORKFLOWS[0];
  const Icon = selected.icon;

  // Click outside to close
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  return (
    <div className={cn("relative z-20", className)} ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "group flex items-center gap-1.5 px-2.5 py-1.5 rounded-md transition-all duration-200",
          "bg-surface-2/50 hover:bg-surface-2 border border-transparent hover:border-border/40",
          "text-xs font-medium text-foreground hover:text-foreground",
          isOpen && "bg-surface-2 text-foreground border-border/40 shadow-sm"
        )}
      >
        <Icon
          className={cn(
            "w-3.5 h-3.5 transition-colors",
            value === "none" ? "text-amber-500/80" : "text-primary/80"
          )}
        />
        <span>{selected.name}</span>
        <ChevronDown
          className={cn(
            "w-3 h-3 text-muted-foreground/50 transition-transform duration-200",
            isOpen && "rotate-180"
          )}
        />
      </button>

      {isOpen && (
        <div
          className={cn(
            "absolute top-full left-0 mt-1.5 w-64 p-1",
            "rounded-xl border border-border/40 bg-surface-1/90 backdrop-blur-xl shadow-xl shadow-black/5",
            "animate-in fade-in zoom-in-95 slide-in-from-top-1 duration-150 ease-out"
          )}
        >
          {WORKFLOWS.map((workflow) => {
            const WorkflowIcon = workflow.icon;
            const isSelected = workflow.id === value;

            return (
              <button
                key={workflow.id}
                type="button"
                onClick={() => {
                  onChange(workflow.id);
                  setIsOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors",
                  "hover:bg-primary/5 group/item",
                  isSelected ? "bg-primary/5" : "text-muted-foreground"
                )}
              >
                <div
                  className={cn(
                    "flex items-center justify-center w-8 h-8 rounded-md transition-colors",
                    isSelected
                      ? "bg-background shadow-sm border border-border/50 text-foreground"
                      : "bg-surface-2/50 text-muted-foreground group-hover/item:text-foreground group-hover/item:bg-surface-2"
                  )}
                >
                  <WorkflowIcon className="w-4 h-4" />
                </div>

                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <span
                    className={cn(
                      "text-xs font-medium truncate",
                      isSelected ? "text-foreground" : "text-foreground/80"
                    )}
                  >
                    {workflow.name}
                  </span>
                  <span className="text-[10px] text-muted-foreground/70 truncate">
                    {workflow.description}
                  </span>
                </div>

                {isSelected && <Check className="w-3.5 h-3.5 text-primary ml-1" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
