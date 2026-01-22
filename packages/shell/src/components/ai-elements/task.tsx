"use client";

import { cn } from "@ku0/shared/utils";
import { ChevronDown } from "lucide-react";
import * as React from "react";
import { useControllableState } from "./use-controllable-state";

interface TaskContextValue {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  contentId: string;
}

const TaskContext = React.createContext<TaskContextValue | null>(null);

function useTaskContext(componentName: string) {
  const context = React.useContext(TaskContext);
  if (!context) {
    throw new Error(`${componentName} must be used within Task.`);
  }
  return context;
}

export interface TaskProps extends React.HTMLAttributes<HTMLDivElement> {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function Task({
  defaultOpen = true,
  open,
  onOpenChange,
  className,
  children,
  ...props
}: TaskProps) {
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
    <TaskContext.Provider value={context}>
      <div
        className={cn(
          "rounded-xl border border-border/40 bg-surface-1/70 p-3 shadow-sm",
          className
        )}
        data-state={isOpen ? "open" : "closed"}
        {...props}
      >
        {children}
      </div>
    </TaskContext.Provider>
  );
}

export interface TaskTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  title: string;
}

export function TaskTrigger({ title, className, ...props }: TaskTriggerProps) {
  const { isOpen, setIsOpen, contentId } = useTaskContext("TaskTrigger");

  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center justify-between gap-2 text-left text-chrome font-semibold",
        "transition-colors duration-fast hover:text-foreground",
        className
      )}
      aria-expanded={isOpen}
      aria-controls={contentId}
      onClick={() => setIsOpen(!isOpen)}
      {...props}
    >
      <span>{title}</span>
      <ChevronDown
        className={cn("size-4 transition-transform duration-fast", isOpen && "rotate-180")}
        aria-hidden="true"
      />
    </button>
  );
}

export interface TaskContentProps extends React.HTMLAttributes<HTMLDivElement> {}

export function TaskContent({ className, children, ...props }: TaskContentProps) {
  const { isOpen, contentId } = useTaskContext("TaskContent");

  return (
    <div
      className={cn("mt-3 space-y-2 text-fine", className)}
      id={contentId}
      hidden={!isOpen}
      data-state={isOpen ? "open" : "closed"}
      {...props}
    >
      {children}
    </div>
  );
}

export interface TaskItemProps extends React.HTMLAttributes<HTMLDivElement> {}

export function TaskItem({ className, ...props }: TaskItemProps) {
  return (
    <div className={cn("flex items-start gap-2 text-muted-foreground", className)} {...props} />
  );
}

export interface TaskItemFileProps extends React.HTMLAttributes<HTMLDivElement> {}

export function TaskItemFile({ className, ...props }: TaskItemFileProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-border/40 bg-surface-2/60 px-2 py-0.5 text-micro text-foreground",
        className
      )}
      {...props}
    />
  );
}
