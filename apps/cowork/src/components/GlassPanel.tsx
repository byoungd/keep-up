import type * as React from "react";
import { cn } from "../lib/cn";

type GlassIntensity = "light" | "medium" | "strong";

const INTENSITY_STYLES: Record<GlassIntensity, { className: string; background: string }> = {
  light: {
    className: "backdrop-blur-sm",
    background: "color-mix(in srgb, var(--glass-bg) 70%, transparent)",
  },
  medium: {
    className: "backdrop-blur-md",
    background: "var(--glass-bg)",
  },
  strong: {
    className: "backdrop-blur-lg",
    background: "color-mix(in srgb, var(--glass-bg) 90%, transparent)",
  },
};

export interface GlassPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  intensity?: GlassIntensity;
}

export function GlassPanel({
  intensity = "medium",
  className,
  style,
  children,
  ...props
}: GlassPanelProps) {
  const intensityStyle = INTENSITY_STYLES[intensity];

  return (
    <div
      className={cn(
        "rounded-2xl border shadow-soft",
        "transition-transform duration-200 ease-out",
        intensityStyle.className,
        className
      )}
      style={{
        background: intensityStyle.background,
        borderColor: "var(--glass-border)",
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}
