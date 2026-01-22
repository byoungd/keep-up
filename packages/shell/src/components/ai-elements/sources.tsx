"use client";

import { cn } from "@ku0/shared/utils";
import { ChevronDown } from "lucide-react";
import * as React from "react";
import { Badge } from "../ui/Badge";
import { useControllableState } from "./use-controllable-state";

interface SourcesContextValue {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  contentId: string;
}

const SourcesContext = React.createContext<SourcesContextValue | null>(null);

function useSourcesContext(componentName: string) {
  const context = React.useContext(SourcesContext);
  if (!context) {
    throw new Error(`${componentName} must be used within Sources.`);
  }
  return context;
}

export interface SourcesProps extends React.HTMLAttributes<HTMLDivElement> {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function Sources({
  open,
  defaultOpen = false,
  onOpenChange,
  className,
  ...props
}: SourcesProps) {
  const contentId = React.useId();
  const [isOpen, setIsOpen] = useControllableState({
    value: open,
    defaultValue: defaultOpen,
    onChange: onOpenChange,
  });

  const context = React.useMemo(
    () => ({ isOpen, setIsOpen, contentId }),
    [isOpen, setIsOpen, contentId]
  );

  return (
    <SourcesContext.Provider value={context}>
      <div
        className={cn("flex flex-col gap-2", className)}
        data-state={isOpen ? "open" : "closed"}
        {...props}
      />
    </SourcesContext.Provider>
  );
}

export interface SourcesTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  count: number;
  label?: string;
}

export function SourcesTrigger({ count, label, className, ...props }: SourcesTriggerProps) {
  const { isOpen, setIsOpen, contentId } = useSourcesContext("SourcesTrigger");
  const resolvedLabel = label ?? "Sources";

  return (
    <button
      type="button"
      className={cn(
        "inline-flex w-fit items-center gap-2 rounded-md border border-border/40 px-2 py-1 text-fine",
        "text-muted-foreground transition-colors duration-fast hover:text-foreground",
        className
      )}
      aria-expanded={isOpen}
      aria-controls={contentId}
      onClick={() => setIsOpen(!isOpen)}
      {...props}
    >
      <ChevronDown
        className={cn("size-3 transition-transform duration-fast", isOpen && "rotate-180")}
        aria-hidden="true"
      />
      <span>{resolvedLabel}</span>
      <Badge variant="outline" className="text-micro">
        {count}
      </Badge>
    </button>
  );
}

export interface SourcesContentProps extends React.HTMLAttributes<HTMLDivElement> {}

export function SourcesContent({ className, children, ...props }: SourcesContentProps) {
  const { isOpen, contentId } = useSourcesContext("SourcesContent");

  return (
    <div
      className={cn("rounded-lg border border-border/30 bg-surface-0/70 p-3", className)}
      id={contentId}
      hidden={!isOpen}
      data-state={isOpen ? "open" : "closed"}
      {...props}
    >
      {children}
    </div>
  );
}

export interface SourceProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {}

export function Source({ className, children, ...props }: SourceProps) {
  return (
    <a
      className={cn(
        "flex flex-col gap-1 text-fine text-foreground transition-colors duration-fast",
        "hover:text-primary",
        className
      )}
      target={props.target ?? "_blank"}
      rel={props.rel ?? "noreferrer"}
      {...props}
    >
      {children ?? props.href}
    </a>
  );
}
