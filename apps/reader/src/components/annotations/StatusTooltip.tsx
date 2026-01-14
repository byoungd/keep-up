"use client";

import { Tooltip } from "@/components/ui/Tooltip";
import { AlertTriangle, Info } from "lucide-react";

interface StatusTooltipProps {
  state: "active_unverified" | "broken_grace" | "active_partial";
  children: React.ReactNode;
}

export function StatusTooltip({ state, children }: StatusTooltipProps) {
  let content: React.ReactNode;

  if (state === "active_unverified") {
    content = (
      <span className="inline-flex items-center gap-2">
        <Info className="h-4 w-4 text-accent-indigo" />
        <span>Verifying consistency check...</span>
      </span>
    );
  } else if (state === "broken_grace") {
    content = (
      <span className="inline-flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-accent-amber" />
        <span>Text context changed. Attempting recovery...</span>
      </span>
    );
  } else if (state === "active_partial") {
    content = (
      <span className="inline-flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-accent-amber" />
        <span>Some spans are missing or out of order.</span>
      </span>
    );
  }

  if (!content) {
    return <>{children}</>;
  }

  return (
    <Tooltip content={content} side="top">
      {children}
    </Tooltip>
  );
}
