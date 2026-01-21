import type * as React from "react";
import { cn } from "../../lib/cn";

type ButtonVariant =
  | "default"
  | "primary"
  | "secondary"
  | "ghost"
  | "outline"
  | "destructive"
  | "magic";
type ButtonSize = "default" | "sm" | "lg" | "icon";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const baseClasses =
  "inline-flex items-center justify-center gap-2 rounded-md text-chrome font-medium transition-[background-color,box-shadow,color] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:pointer-events-none disabled:opacity-50";

const variantClasses: Record<ButtonVariant, string> = {
  default: "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 active:shadow-none",
  primary: "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 active:shadow-none",
  secondary: "bg-surface-2 text-foreground shadow-sm hover:bg-surface-3 active:shadow-none",
  ghost: "text-muted-foreground hover:text-foreground hover:bg-surface-2/70",
  outline: "border border-border/70 bg-transparent text-foreground hover:bg-surface-2",
  destructive: "bg-error/10 text-error border border-error/20 hover:bg-error/20",
  magic:
    "bg-linear-to-r from-accent-ai to-accent-indigo text-white shadow-sm hover:shadow-md active:shadow-none",
};

const sizeClasses: Record<ButtonSize, string> = {
  default: "h-10 px-4 py-2",
  sm: "h-9 rounded-md px-3",
  lg: "h-11 px-8",
  icon: "h-10 w-10",
};

export function Button({
  className,
  variant = "default",
  size = "default",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(baseClasses, variantClasses[variant], sizeClasses[size], className)}
      {...props}
    />
  );
}
