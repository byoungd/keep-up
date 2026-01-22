"use client";

import { cn } from "@ku0/shared/utils";
import { ArrowDown } from "lucide-react";
import * as React from "react";
import { Button } from "../ui/Button";

export interface ConversationContextValue {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  contentRef: React.RefObject<HTMLDivElement | null>;
  isAtBottom: boolean;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
}

const ConversationContext = React.createContext<ConversationContextValue | null>(null);

function useConversationContext(componentName: string) {
  const context = React.useContext(ConversationContext);
  if (!context) {
    throw new Error(`${componentName} must be used within Conversation.`);
  }
  return context;
}

type ConversationChildren =
  | React.ReactNode
  | ((context: ConversationContextValue) => React.ReactNode);

export interface ConversationProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  children: ConversationChildren;
}

const SCROLL_BOTTOM_THRESHOLD = 24;

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function Conversation({ children, className, onScroll, ...props }: ConversationProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = React.useState(true);
  const isAtBottomRef = React.useRef(isAtBottom);

  React.useEffect(() => {
    isAtBottomRef.current = isAtBottom;
  }, [isAtBottom]);

  const updateIsAtBottom = React.useCallback(() => {
    const node = scrollRef.current;
    if (!node) {
      return;
    }
    const distance = node.scrollHeight - node.scrollTop - node.clientHeight;
    setIsAtBottom(distance <= SCROLL_BOTTOM_THRESHOLD);
  }, []);

  const scrollToBottom = React.useCallback((behavior?: ScrollBehavior) => {
    const node = scrollRef.current;
    if (!node) {
      return;
    }
    const resolvedBehavior = behavior ?? (prefersReducedMotion() ? "auto" : "smooth");
    node.scrollTo({ top: node.scrollHeight, behavior: resolvedBehavior });
  }, []);

  React.useEffect(() => {
    updateIsAtBottom();
  }, [updateIsAtBottom]);

  React.useEffect(() => {
    const scrollNode = scrollRef.current;
    const contentNode = contentRef.current;
    if (!scrollNode || !contentNode || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => {
      if (isAtBottomRef.current) {
        scrollToBottom();
      }
    });

    observer.observe(contentNode);
    return () => observer.disconnect();
  }, [scrollToBottom]);

  const context = React.useMemo(
    () => ({ scrollRef, contentRef, isAtBottom, scrollToBottom }),
    [isAtBottom, scrollToBottom]
  );

  const resolvedChildren = typeof children === "function" ? children(context) : children;

  const handleScroll: React.UIEventHandler<HTMLDivElement> = (event) => {
    updateIsAtBottom();
    onScroll?.(event);
  };

  return (
    <ConversationContext.Provider value={context}>
      <div
        ref={scrollRef}
        className={cn(
          "relative flex-1 overflow-y-auto overflow-x-hidden scrollbar-auto-hide",
          className
        )}
        onScroll={handleScroll}
        {...props}
      >
        {resolvedChildren}
      </div>
    </ConversationContext.Provider>
  );
}

export interface ConversationContentProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  children: ConversationChildren;
}

export function ConversationContent({ children, className, ...props }: ConversationContentProps) {
  const context = useConversationContext("ConversationContent");
  const resolvedChildren = typeof children === "function" ? children(context) : children;

  return (
    <div
      ref={context.contentRef}
      className={cn("flex flex-col gap-6 px-6 py-6", className)}
      {...props}
    >
      {resolvedChildren}
    </div>
  );
}

export interface ConversationEmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
}

export function ConversationEmptyState({
  title = "No messages yet",
  description = "Start a conversation to see messages here",
  icon,
  className,
  children,
  ...props
}: ConversationEmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 py-12 text-center text-muted-foreground",
        className
      )}
      {...props}
    >
      {icon ? <div className="text-muted-foreground/80">{icon}</div> : null}
      <div className="text-chrome font-semibold text-foreground">{title}</div>
      <p className="text-fine text-muted-foreground">{description}</p>
      {children}
    </div>
  );
}

export function ConversationScrollButton({
  className,
  onClick,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { isAtBottom, scrollToBottom } = useConversationContext("ConversationScrollButton");

  const handleClick: React.MouseEventHandler<HTMLButtonElement> = (event) => {
    onClick?.(event);
    if (!event.defaultPrevented) {
      scrollToBottom();
    }
  };

  return (
    <Button
      type="button"
      variant="secondary"
      size="icon"
      aria-label="Scroll to bottom"
      data-state={isAtBottom ? "hidden" : "visible"}
      className={cn(
        "absolute bottom-4 right-4 shadow-sm transition-all duration-fast",
        isAtBottom && "pointer-events-none opacity-0 translate-y-1",
        className
      )}
      onClick={handleClick}
      {...props}
    >
      <ArrowDown className="size-4" aria-hidden="true" />
    </Button>
  );
}
