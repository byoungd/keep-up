"use client";

import { Button, type ButtonProps } from "@/components/ui/Button";
import type { IssueAction, IssueDefinition } from "@/lib/issues/issues";
import { cn } from "@ku0/shared/utils";

export type IssueActionHandlers = {
  onCopyDiagnostics?: () => void;
  onExportRepro?: () => void;
  onReload?: () => void;
  onReadOnly?: () => void;
  onDismiss?: () => void;
};

type IssueActionButtonsProps = {
  issue: IssueDefinition | null;
  handlers: IssueActionHandlers;
  size?: ButtonProps["size"];
  className?: string;
};

const ACTION_LABELS = {
  copy_diagnostics: "Copy diagnostics",
  export_repro: "Export repro",
  reload: "Reload",
  read_only: "Read-only mode",
  dismiss: "Dismiss",
} satisfies Record<IssueAction, string>;

const ACTION_VARIANTS = {
  copy_diagnostics: "outline",
  export_repro: "outline",
  reload: "primary",
  read_only: "secondary",
  dismiss: "ghost",
} satisfies Record<IssueAction, ButtonProps["variant"]>;

function getHandler(action: IssueAction, handlers: IssueActionHandlers): (() => void) | undefined {
  switch (action) {
    case "copy_diagnostics":
      return handlers.onCopyDiagnostics;
    case "export_repro":
      return handlers.onExportRepro;
    case "reload":
      return handlers.onReload;
    case "read_only":
      return handlers.onReadOnly;
    case "dismiss":
      return handlers.onDismiss;
    default:
      return undefined;
  }
}

export function IssueActionButtons({
  issue,
  handlers,
  size = "compact",
  className,
}: IssueActionButtonsProps) {
  if (!issue) {
    return null;
  }

  const actionEntries = issue.actions
    .map((action) => ({
      action,
      handler: getHandler(action, handlers),
    }))
    .filter(({ action, handler }) => {
      if (!handler) {
        return false;
      }
      if (action === "dismiss" && issue.severity === "blocking") {
        return false;
      }
      return true;
    });

  if (actionEntries.length === 0) {
    return null;
  }

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {actionEntries.map(({ action, handler }) => (
        <Button
          key={action}
          type="button"
          size={size}
          variant={ACTION_VARIANTS[action]}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            handler?.();
          }}
        >
          {ACTION_LABELS[action]}
        </Button>
      ))}
    </div>
  );
}
