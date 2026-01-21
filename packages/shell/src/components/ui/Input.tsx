import { cn } from "@ku0/shared/utils";
import * as React from "react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  variant?: "default" | "search"; // Add variants as needed
  error?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, leftIcon, rightIcon, variant = "default", error, ...props }, ref) => {
    // Determine base classes
    const baseClasses = cn(
      "flex h-9 w-full rounded-md border border-transparent bg-surface-2 px-3 py-1 text-chrome text-foreground transition-colors duration-fast ease-out file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground/70",
      "hover:border-border/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary/40",
      "disabled:cursor-not-allowed disabled:opacity-50",
      error && "border-destructive/40 ring-1 ring-destructive/30 focus-visible:ring-destructive/40"
    );

    // Adjust padding if icons are present
    const paddingLeft = leftIcon ? "pl-9" : "pl-3";
    const paddingRight = rightIcon ? "pr-9" : "pr-3";

    return (
      <div className="relative w-full">
        {leftIcon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground flex items-center pointer-events-none">
            {leftIcon}
          </div>
        )}
        <input
          type={type}
          className={cn(baseClasses, paddingLeft, paddingRight, className)}
          ref={ref}
          {...props}
        />
        {rightIcon && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground flex items-center">
            {rightIcon}
          </div>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";

export { Input };
