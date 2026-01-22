"use client";

import { cn } from "@ku0/shared/utils";
import * as React from "react";
import { MessageBubble } from "../chat/MessageBubble";
import { Button } from "../ui/Button";

export type MessageRole = "user" | "assistant" | "system" | "tool";

interface MessageContextValue {
  from: MessageRole;
}

const MessageContext = React.createContext<MessageContextValue | null>(null);

function useMessageContext(componentName: string) {
  const context = React.useContext(MessageContext);
  if (!context) {
    throw new Error(`${componentName} must be used within Message.`);
  }
  return context;
}

export interface MessageProps extends React.HTMLAttributes<HTMLDivElement> {
  from: MessageRole;
}

export function Message({ from, className, children, ...props }: MessageProps) {
  const alignment =
    from === "user" ? "justify-end" : from === "system" ? "justify-center" : "justify-start";

  return (
    <MessageContext.Provider value={{ from }}>
      <div className={cn("flex w-full", alignment, className)} data-role={from} {...props}>
        {children}
      </div>
    </MessageContext.Provider>
  );
}

export interface MessageContentProps extends React.HTMLAttributes<HTMLDivElement> {}

export function MessageContent({ className, ...props }: MessageContentProps) {
  const { from } = useMessageContext("MessageContent");
  const isUser = from === "user";
  const isSystem = from === "system";

  return (
    <div
      className={cn(
        "max-w-[70ch] w-fit rounded-xl border border-border/40 px-4 py-3 shadow-sm",
        isUser && "bg-surface-2 text-foreground",
        isSystem && "bg-surface-1/60 text-muted-foreground",
        !isUser && !isSystem && "bg-surface-1 text-foreground",
        className
      )}
      {...props}
    />
  );
}

export interface MessageResponseProps extends React.HTMLAttributes<HTMLDivElement> {
  children: string;
  isStreaming?: boolean;
}

export function MessageResponse({
  children,
  className,
  isStreaming = false,
  ...props
}: MessageResponseProps) {
  const { from } = useMessageContext("MessageResponse");
  const isUser = from === "user";

  return (
    <div className={cn("w-full", className)} {...props}>
      <MessageBubble
        content={children}
        isUser={isUser}
        isStreaming={isStreaming}
        className="max-w-full"
      />
    </div>
  );
}

export interface MessageActionsProps extends React.HTMLAttributes<HTMLDivElement> {}

export function MessageActions({ className, ...props }: MessageActionsProps) {
  const { from } = useMessageContext("MessageActions");
  const alignment = from === "user" ? "justify-end" : "justify-start";

  return <div className={cn("mt-2 flex items-center gap-2", alignment, className)} {...props} />;
}

export interface MessageActionProps extends React.ComponentProps<typeof Button> {
  label: string;
  tooltip?: string;
}

export function MessageAction({ label, tooltip, className, ...props }: MessageActionProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      title={tooltip ?? label}
      className={cn("h-7 w-7 text-muted-foreground hover:text-foreground", className)}
      {...props}
    />
  );
}
