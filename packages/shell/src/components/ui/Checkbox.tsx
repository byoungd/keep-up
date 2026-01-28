import { cn } from "@ku0/shared/utils";
import { Check, Minus } from "lucide-react";
import * as React from "react";

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  /** Size variant */
  size?: "default" | "sm" | "lg";
  /** Indeterminate state (partial selection) */
  indeterminate?: boolean;
  /** Error state */
  error?: boolean;
  /** Label text */
  label?: string;
  /** Description text (shown below label) */
  description?: string;
}

const sizeStyles = {
  default: "h-4 w-4",
  sm: "h-3.5 w-3.5",
  lg: "h-5 w-5",
};

const iconSizes = {
  default: "h-3 w-3",
  sm: "h-2.5 w-2.5",
  lg: "h-3.5 w-3.5",
};

/**
 * Checkbox component with support for indeterminate state and labels.
 *
 * @example
 * ```tsx
 * // Basic checkbox
 * <Checkbox checked={checked} onChange={handleChange} />
 *
 * // With label
 * <Checkbox label="Accept terms" checked={checked} onChange={handleChange} />
 *
 * // Indeterminate (partial selection)
 * <Checkbox indeterminate label="Select all" />
 *
 * // With description
 * <Checkbox
 *   label="Email notifications"
 *   description="Receive updates about your account"
 * />
 * ```
 */
const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  (
    {
      className,
      size = "default",
      indeterminate = false,
      error,
      label,
      description,
      id,
      disabled,
      ...props
    },
    ref
  ) => {
    const internalRef = React.useRef<HTMLInputElement>(null);
    const checkboxRef = (ref as React.RefObject<HTMLInputElement>) || internalRef;
    const generatedId = React.useId();
    const checkboxId = id || generatedId;

    // Sync indeterminate property (not available as HTML attribute)
    React.useEffect(() => {
      if (checkboxRef.current) {
        checkboxRef.current.indeterminate = indeterminate;
      }
    }, [indeterminate, checkboxRef]);

    const checkbox = (
      <div className="relative inline-flex items-center justify-center align-middle">
        <input
          type="checkbox"
          id={checkboxId}
          className={cn(
            "peer shrink-0 appearance-none rounded-sm border shadow",
            "focus-visible:outline-none focus-visible:ring-1",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "checked:bg-primary checked:border-primary",
            sizeStyles[size],
            error
              ? "border-destructive focus-visible:ring-destructive"
              : "border-primary focus-visible:ring-ring",
            className
          )}
          ref={checkboxRef}
          disabled={disabled}
          {...props}
        />
        {/* Check icon - shown when checked and not indeterminate */}
        <Check
          className={cn(
            "pointer-events-none absolute text-primary-foreground opacity-0",
            "peer-checked:opacity-100",
            indeterminate && "peer-checked:opacity-0",
            iconSizes[size]
          )}
          aria-hidden="true"
        />
        {/* Minus icon - shown when indeterminate */}
        {indeterminate && (
          <Minus
            className={cn("pointer-events-none absolute text-primary-foreground", iconSizes[size])}
            aria-hidden="true"
          />
        )}
      </div>
    );

    // If no label, return just the checkbox
    if (!label) {
      return checkbox;
    }

    // With label, wrap in a label element
    return (
      <div className={cn("flex items-start gap-2", disabled && "opacity-50")}>
        {checkbox}
        <div className="flex flex-col">
          <label
            htmlFor={checkboxId}
            className={cn(
              "text-sm font-medium leading-none cursor-pointer select-none",
              "peer-disabled:cursor-not-allowed",
              error ? "text-destructive" : "text-foreground"
            )}
          >
            {label}
          </label>
          {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
        </div>
      </div>
    );
  }
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
