"use client";

import { useAutosizeTextArea } from "@ku0/shared/ui/chat";
import { cn } from "@ku0/shared/utils";
import { Slot } from "@radix-ui/react-slot";
import { AlertTriangle, ArrowUp, Loader2, Square } from "lucide-react";
import type * as React from "react";
import { Button } from "../ui/Button";

export type PromptInputStatus = "ready" | "submitted" | "streaming" | "error";

const PROMPT_SUBMIT_CONFIG = {
  ready: {
    icon: ArrowUp,
    label: "Send message",
    variant: "primary",
    type: "submit",
    spin: false,
  },
  submitted: {
    icon: Loader2,
    label: "Submitting",
    variant: "primary",
    type: "submit",
    spin: true,
  },
  streaming: {
    icon: Square,
    label: "Stop generating",
    variant: "primary",
    type: "button",
    spin: false,
  },
  error: {
    icon: AlertTriangle,
    label: "Retry",
    variant: "destructive",
    type: "submit",
    spin: false,
  },
} as const;

export interface PromptInputProps extends React.FormHTMLAttributes<HTMLFormElement> {
  status?: PromptInputStatus;
  asChild?: boolean;
}

export function PromptInput({
  className,
  status = "ready",
  asChild = false,
  ...props
}: PromptInputProps) {
  const ariaBusy = props["aria-busy"] ?? (status === "streaming" || status === "submitted");
  const Component = asChild ? Slot : "form";

  return (
    <Component
      className={cn(
        "flex flex-col gap-2 rounded-xl border border-border/40 bg-surface-1/80 p-2 shadow-sm",
        "focus-within:border-border/70 focus-within:ring-2 focus-within:ring-ring/30",
        className
      )}
      data-state={status}
      aria-busy={ariaBusy}
      {...props}
    />
  );
}

export interface PromptInputBodyProps extends React.HTMLAttributes<HTMLDivElement> {}

export function PromptInputBody({ className, ...props }: PromptInputBodyProps) {
  return <div className={cn("flex flex-col gap-2", className)} {...props} />;
}

export interface PromptInputFooterProps extends React.HTMLAttributes<HTMLDivElement> {}

export function PromptInputFooter({ className, ...props }: PromptInputFooterProps) {
  return <div className={cn("flex items-center justify-between gap-2", className)} {...props} />;
}

export interface PromptInputToolsProps extends React.HTMLAttributes<HTMLDivElement> {}

export function PromptInputTools({ className, ...props }: PromptInputToolsProps) {
  return <div className={cn("flex items-center gap-2", className)} {...props} />;
}

export interface PromptInputTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  maxHeight?: number;
}

export function PromptInputTextarea({
  className,
  value,
  maxHeight = 160,
  rows = 1,
  ...props
}: PromptInputTextareaProps) {
  const textValue = typeof value === "string" ? value : "";
  const textAreaRef = useAutosizeTextArea(textValue, maxHeight);

  return (
    <textarea
      ref={textAreaRef}
      rows={rows}
      className={cn(
        "min-h-[44px] w-full resize-none bg-transparent px-3 py-2 text-content text-foreground",
        "placeholder:text-muted-foreground/70 focus:outline-none",
        className
      )}
      aria-label={props["aria-label"] ?? "Message input"}
      value={value}
      {...props}
    />
  );
}

export interface PromptInputSubmitProps extends React.ComponentProps<typeof Button> {
  status?: PromptInputStatus;
}

export function PromptInputSubmit({
  status = "ready",
  className,
  type,
  ...props
}: PromptInputSubmitProps) {
  const config = PROMPT_SUBMIT_CONFIG[status];
  const Icon = config.icon;
  const resolvedType = type ?? config.type;

  return (
    <Button
      type={resolvedType}
      size="icon"
      variant={config.variant}
      aria-label={config.label}
      data-state={status}
      className={cn("h-9 w-9", className)}
      {...props}
    >
      <Icon className={cn("size-4", config.spin && "animate-spin")} aria-hidden="true" />
    </Button>
  );
}
