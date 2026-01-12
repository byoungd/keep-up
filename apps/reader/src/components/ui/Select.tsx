import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import * as React from "react";

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  /** Size variant */
  size?: "default" | "sm" | "lg";
  /** Error state */
  error?: boolean;
  /** Full width */
  fullWidth?: boolean;
}

const sizeStyles = {
  default: "h-9 px-3 py-2 text-sm",
  sm: "h-8 px-2 py-1 text-xs",
  lg: "h-11 px-4 py-3 text-base",
};

const iconSizes = {
  default: "h-4 w-4 top-2.5 right-3",
  sm: "h-3.5 w-3.5 top-2 right-2",
  lg: "h-5 w-5 top-3 right-4",
};

/**
 * Native select component with consistent styling.
 *
 * @example
 * ```tsx
 * <Select value={value} onChange={(e) => setValue(e.target.value)}>
 *   <option value="">Select an option</option>
 *   <option value="a">Option A</option>
 *   <option value="b">Option B</option>
 * </Select>
 * ```
 */
const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, size = "default", error, fullWidth, ...props }, ref) => {
    return (
      <div className={cn("relative", fullWidth && "w-full")}>
        <select
          className={cn(
            "flex w-full appearance-none items-center justify-between rounded-md border bg-background shadow-sm ring-offset-background",
            "placeholder:text-muted-foreground focus:outline-none focus:ring-1",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "pr-8",
            sizeStyles[size],
            error ? "border-destructive focus:ring-destructive" : "border-input focus:ring-ring",
            className
          )}
          ref={ref}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className={cn("absolute opacity-50 pointer-events-none", iconSizes[size])} />
      </div>
    );
  }
);
Select.displayName = "Select";

/**
 * Option component for Select (just a styled native option).
 */
function SelectOption({ children, ...props }: React.OptionHTMLAttributes<HTMLOptionElement>) {
  return <option {...props}>{children}</option>;
}

export { Select, SelectOption };
