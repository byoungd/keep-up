"use client";

import { cn } from "@ku0/shared/utils";
import { ChevronDown } from "lucide-react";
import * as React from "react";
import { Badge, type BadgeProps } from "../ui/Badge";
import { useControllableState } from "./use-controllable-state";

export type ToolState =
  | "input-streaming"
  | "input-available"
  | "approval-requested"
  | "approval-responded"
  | "output-available"
  | "output-error"
  | "output-denied";

interface ToolContextValue {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  contentId: string;
}

const ToolContext = React.createContext<ToolContextValue | null>(null);

function useToolContext(componentName: string) {
  const context = React.useContext(ToolContext);
  if (!context) {
    throw new Error(`${componentName} must be used within Tool.`);
  }
  return context;
}

const TOOL_STATUS: Record<ToolState, { label: string; variant: BadgeProps["variant"] }> = {
  "input-streaming": { label: "Pending", variant: "secondary" },
  "input-available": { label: "Running", variant: "warning" },
  "approval-requested": { label: "Awaiting Approval", variant: "warning" },
  "approval-responded": { label: "Responded", variant: "secondary" },
  "output-available": { label: "Completed", variant: "success" },
  "output-error": { label: "Error", variant: "destructive" },
  "output-denied": { label: "Denied", variant: "destructive" },
};

type FormattedPayload = {
  text: string;
  kind: "empty" | "text" | "json" | "error";
};

function formatToolPayload(value: unknown, emptyLabel: string): FormattedPayload {
  if (value === null || value === undefined) {
    return { text: emptyLabel, kind: "empty" };
  }
  if (typeof value === "string") {
    return { text: value, kind: "text" };
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return { text: value.toString(), kind: "text" };
  }
  if (typeof value === "boolean") {
    return { text: value ? "true" : "false", kind: "text" };
  }
  if (value instanceof Error) {
    return { text: value.message || emptyLabel, kind: "text" };
  }
  try {
    const serialized = JSON.stringify(value, null, 2);
    if (serialized !== undefined) {
      return { text: serialized, kind: "json" };
    }
    return { text: String(value), kind: "text" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to serialize payload.";
    return { text: message, kind: "error" };
  }
}

export function getStatusBadge(state: ToolState) {
  const config = TOOL_STATUS[state];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

export interface ToolProps extends React.HTMLAttributes<HTMLDivElement> {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function Tool({
  defaultOpen = false,
  open,
  onOpenChange,
  className,
  children,
  ...props
}: ToolProps) {
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
    <ToolContext.Provider value={context}>
      <div
        className={cn("rounded-xl border border-border/40 bg-surface-1/70 p-3", className)}
        data-state={isOpen ? "open" : "closed"}
        {...props}
      >
        {children}
      </div>
    </ToolContext.Provider>
  );
}

export interface ToolHeaderProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  title?: string;
  type: string;
  state: ToolState;
  toolName?: string;
}

export function ToolHeader({ title, type, state, toolName, className, ...props }: ToolHeaderProps) {
  const { isOpen, setIsOpen, contentId } = useToolContext("ToolHeader");

  const resolvedTitle =
    title ??
    (type === "dynamic-tool"
      ? (toolName ?? "Dynamic tool")
      : type.replace(/^tool-/, "").replace(/_/g, " "));

  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center justify-between gap-3 text-left",
        "transition-colors duration-fast hover:text-foreground",
        className
      )}
      aria-expanded={isOpen}
      aria-controls={contentId}
      onClick={() => setIsOpen(!isOpen)}
      {...props}
    >
      <div className="flex items-center gap-2">
        <ChevronDown
          className={cn("size-4 transition-transform duration-fast", isOpen && "rotate-180")}
          aria-hidden="true"
        />
        <span className="text-chrome font-semibold text-foreground">{resolvedTitle}</span>
      </div>
      {getStatusBadge(state)}
    </button>
  );
}

export interface ToolContentProps extends React.HTMLAttributes<HTMLDivElement> {}

export function ToolContent({ className, children, ...props }: ToolContentProps) {
  const { isOpen, contentId } = useToolContext("ToolContent");

  return (
    <div
      className={cn("mt-3 space-y-3", className)}
      id={contentId}
      hidden={!isOpen}
      data-state={isOpen ? "open" : "closed"}
      {...props}
    >
      {children}
    </div>
  );
}

export interface ToolInputProps extends React.HTMLAttributes<HTMLDivElement> {
  input: unknown;
}

export function ToolInput({ input, className, ...props }: ToolInputProps) {
  const formattedInput = React.useMemo(() => formatToolPayload(input, "No input"), [input]);

  return (
    <div
      className={cn("rounded-lg border border-border/40 bg-surface-2/60 p-3", className)}
      {...props}
    >
      <div className="mb-2 text-fine font-semibold text-muted-foreground">Input</div>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-fine text-foreground/80">
        {formattedInput.text}
      </pre>
    </div>
  );
}

export interface ToolOutputProps extends React.HTMLAttributes<HTMLDivElement> {
  output?: React.ReactNode;
  errorText?: string;
}

export function ToolOutput({ output, errorText, className, ...props }: ToolOutputProps) {
  const outputIsNode = React.useMemo(
    () => React.isValidElement(output) || Array.isArray(output),
    [output]
  );
  const formattedOutput = React.useMemo(
    () => (outputIsNode ? { text: "", kind: "empty" } : formatToolPayload(output, "No output")),
    [output, outputIsNode]
  );

  return (
    <div
      className={cn("rounded-lg border border-border/40 bg-surface-1/60 p-3", className)}
      {...props}
    >
      <div className="mb-2 text-fine font-semibold text-muted-foreground">Output</div>
      {errorText ? (
        <div className="text-fine text-destructive">{errorText}</div>
      ) : outputIsNode ? (
        <div className="text-fine text-foreground/80 whitespace-pre-wrap">{output}</div>
      ) : formattedOutput.kind === "json" ? (
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-fine text-foreground/80">
          {formattedOutput.text}
        </pre>
      ) : formattedOutput.kind === "empty" ? (
        <div className="text-fine text-muted-foreground">{formattedOutput.text}</div>
      ) : formattedOutput.kind === "error" ? (
        <div className="text-fine text-muted-foreground">{formattedOutput.text}</div>
      ) : (
        <div className="text-fine text-foreground/80 whitespace-pre-wrap">
          {formattedOutput.text}
        </div>
      )}
    </div>
  );
}
