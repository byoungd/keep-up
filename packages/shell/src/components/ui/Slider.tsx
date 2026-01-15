"use client";

import { cn } from "@ku0/shared/utils";
import * as React from "react";

interface SliderProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  label?: string;
  showValue?: boolean;
  formatValue?: (val: number) => string;
  /** Accessible name for screen readers (required if no visible label) */
  "aria-label"?: string;
  /** ID of element that labels this slider */
  "aria-labelledby"?: string;
}

/**
 * Accessible slider component with keyboard navigation and ARIA support.
 *
 * Keyboard controls:
 * - Arrow Left/Down: Decrease value by step
 * - Arrow Right/Up: Increase value by step
 * - Home: Jump to min
 * - End: Jump to max
 * - Page Up/Down: Jump by 10% of range
 */
export const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  (
    {
      className,
      value,
      min = 0,
      max = 100,
      step = 1,
      onChange,
      label,
      showValue,
      formatValue,
      "aria-label": ariaLabel,
      "aria-labelledby": ariaLabelledBy,
      id,
      ...props
    },
    ref
  ) => {
    const inputId = id ?? React.useId();
    const labelId = `${inputId}-label`;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(Number(e.target.value));
    };

    // Enhanced keyboard handling for page up/down
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      const range = max - min;
      const pageStep = Math.max(1, Math.round(range * 0.1));

      switch (e.key) {
        case "PageUp":
          e.preventDefault();
          onChange(Math.min(max, value + pageStep));
          break;
        case "PageDown":
          e.preventDefault();
          onChange(Math.max(min, value - pageStep));
          break;
        case "Home":
          e.preventDefault();
          onChange(min);
          break;
        case "End":
          e.preventDefault();
          onChange(max);
          break;
        // Arrow keys handled natively by input[type=range]
      }
    };

    // Calculate percentage for gradient track background
    const percentage = ((value - min) / (max - min)) * 100;

    return (
      <div className={cn("w-full space-y-2", className)}>
        {(label || showValue) && (
          <div className="flex items-center justify-between">
            {label && (
              <label
                id={labelId}
                htmlFor={inputId}
                className="text-xs font-medium text-muted-foreground uppercase tracking-wider"
              >
                {label}
              </label>
            )}
            {showValue && (
              <span
                aria-live="polite"
                className="text-xs font-mono text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded"
              >
                {formatValue ? formatValue(value) : value}
              </span>
            )}
          </div>
        )}

        <div className="relative flex items-center h-4 w-full">
          {/* Native range input with ARIA attributes */}
          <input
            type="range"
            id={inputId}
            ref={ref}
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            aria-valuenow={value}
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuetext={formatValue ? formatValue(value) : String(value)}
            aria-label={!label ? ariaLabel : undefined}
            aria-labelledby={label ? labelId : ariaLabelledBy}
            className={cn(
              "absolute w-full h-1.5 opacity-0 cursor-pointer z-20",
              "focus-visible:outline-none"
            )}
            {...props}
          />

          {/* Visual Track */}
          <div
            className="absolute top-1/2 -translate-y-1/2 w-full h-1.5 bg-surface-2 rounded-full overflow-hidden z-10 pointer-events-none"
            aria-hidden="true"
          >
            <div
              className="h-full bg-primary transition-all duration-75 ease-out"
              style={{ width: `${percentage}%` }}
            />
          </div>

          {/* Visual Thumb - Focus ring via parent input's focus-visible */}
          <div
            className={cn(
              "absolute top-1/2 -translate-y-1/2 h-4 w-4 bg-background border-2 border-primary/70 rounded-full shadow-sm z-10 pointer-events-none transition-all duration-75 ease-out",
              "peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2"
            )}
            style={{ left: `calc(${percentage}% + (${8 - percentage * 0.16}px))` }}
            aria-hidden="true"
          />
        </div>
      </div>
    );
  }
);
Slider.displayName = "Slider";
