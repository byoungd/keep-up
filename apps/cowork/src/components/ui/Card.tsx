import * as React from "react";
import { cn } from "../../lib/cn";

type CardTone = "default" | "subtle";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: CardTone;
}

const toneClasses: Record<CardTone, string> = {
  default: "bg-surface-1 text-foreground",
  subtle: "bg-surface-0 text-foreground",
};

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ tone = "default", className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "rounded-lg p-4 transition-colors duration-150 ease-out",
          toneClasses[tone],
          className
        )}
        {...props}
      />
    );
  }
);

Card.displayName = "Card";
