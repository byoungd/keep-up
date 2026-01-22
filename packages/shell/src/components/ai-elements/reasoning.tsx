"use client";

import { cn } from "@ku0/shared/utils";
import { ChevronDown } from "lucide-react";
import * as React from "react";
import { useControllableState } from "./use-controllable-state";

interface ReasoningContextValue {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  isStreaming: boolean;
  duration?: number;
  contentId: string;
}

const ReasoningContext = React.createContext<ReasoningContextValue | null>(null);

export function useReasoning() {
  const context = React.useContext(ReasoningContext);
  if (!context) {
    throw new Error("useReasoning must be used within Reasoning.");
  }
  return context;
}

export interface ReasoningProps extends React.HTMLAttributes<HTMLDivElement> {
  isStreaming?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  duration?: number;
}

export function Reasoning({
  isStreaming = false,
  open,
  defaultOpen = true,
  onOpenChange,
  duration,
  className,
  children,
  ...props
}: ReasoningProps) {
  const contentId = React.useId();
  const [isOpen, setIsOpen] = useControllableState({
    value: open,
    defaultValue: defaultOpen,
    onChange: onOpenChange,
  });
  const [autoOpened, setAutoOpened] = React.useState(false);

  React.useEffect(() => {
    if (isStreaming && !isOpen) {
      setIsOpen(true);
      setAutoOpened(true);
    } else if (!isStreaming && autoOpened) {
      setIsOpen(false);
      setAutoOpened(false);
    }
  }, [autoOpened, isOpen, isStreaming, setIsOpen]);

  const context = React.useMemo(
    () => ({ isOpen, setIsOpen, isStreaming, duration, contentId }),
    [isOpen, isStreaming, duration, setIsOpen, contentId]
  );

  return (
    <ReasoningContext.Provider value={context}>
      <div
        className={cn("rounded-lg border border-border/40 bg-surface-1/60 px-3 py-2", className)}
        data-state={isOpen ? "open" : "closed"}
        {...props}
      >
        {children}
      </div>
    </ReasoningContext.Provider>
  );
}

export interface ReasoningTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  getThinkingMessage?: (isStreaming: boolean, duration?: number) => React.ReactNode;
}

export function ReasoningTrigger({
  className,
  getThinkingMessage,
  ...props
}: ReasoningTriggerProps) {
  const { isOpen, setIsOpen, isStreaming, duration, contentId } = useReasoning();
  const label = getThinkingMessage
    ? getThinkingMessage(isStreaming, duration)
    : isStreaming
      ? "Thinking..."
      : "Reasoning";

  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center justify-between gap-2 text-fine font-medium text-muted-foreground",
        "transition-colors duration-fast hover:text-foreground",
        className
      )}
      aria-expanded={isOpen}
      aria-controls={contentId}
      onClick={() => setIsOpen(!isOpen)}
      {...props}
    >
      <span className="flex items-center gap-2">
        <ChevronDown
          className={cn("size-3 transition-transform duration-fast", isOpen && "rotate-180")}
          aria-hidden="true"
        />
        <span>{label}</span>
      </span>
    </button>
  );
}

export interface ReasoningContentProps extends React.HTMLAttributes<HTMLDivElement> {}

export function ReasoningContent({ className, children, ...props }: ReasoningContentProps) {
  const { isOpen, contentId } = useReasoning();

  return (
    <div
      className={cn(
        "mt-2 rounded-md border border-border/30 bg-surface-0/70 p-3 text-fine text-muted-foreground",
        className
      )}
      id={contentId}
      hidden={!isOpen}
      data-state={isOpen ? "open" : "closed"}
      {...props}
    >
      {children}
    </div>
  );
}
