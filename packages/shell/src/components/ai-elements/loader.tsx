"use client";

import { cn } from "@ku0/shared/utils";
import { Loader2 } from "lucide-react";
import type * as React from "react";

export interface LoaderProps extends React.ComponentProps<"output"> {
  size?: "sm" | "md" | "lg";
  label?: string;
}

export function Loader({ size = "md", label, className, ...props }: LoaderProps) {
  const sizeClass = size === "sm" ? "size-4" : size === "lg" ? "size-6" : "size-5";
  const ariaLive = props["aria-live"] ?? "polite";

  return (
    <output
      className={cn("inline-flex items-center gap-2 text-muted-foreground", className)}
      aria-live={ariaLive}
      {...props}
    >
      <Loader2 className={cn(sizeClass)} aria-hidden="true" />
      {label ? <span className="text-fine">{label}</span> : null}
      {!label ? <span className="sr-only">Loading</span> : null}
    </output>
  );
}
